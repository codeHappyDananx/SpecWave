import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OrchestratorRiskLevel } from '@specwave/contracts';
import { createAgentRuntime } from './agentRuntime';
import { AssistantService } from './assistantService';
import { JsonFileAssistantStateStore } from './assistantStateStore';
import { loadConnectorConfig } from './connectorConfig';
import { createDesktopAutomation } from './desktopAutomation';
import { startDingtalkStreamBridge } from './dingtalkStreamBridge';
import { startHttpServer } from './httpServer';
import { AppNotificationSender } from './notificationSender';
import { OrchestratorService } from './orchestratorService';
import { startProactiveGreeting } from './proactiveGreeting';
import { JsonFileStateStore } from './stateStore';
import { startTelegramPollingBridge } from './telegramPollingBridge';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveStatePath(): string {
  const envPath = process.env.SPECWAVE_ORCHESTRATOR_STATE?.trim();
  if (envPath) return path.resolve(envPath);
  return path.resolve(__dirname, '..', '..', '..', '.specwave', 'orchestrator-state.json');
}

function resolveAssistantStatePath(): string {
  const envPath = process.env.SPECWAVE_ASSISTANT_STATE?.trim();
  if (envPath) return path.resolve(envPath);
  return path.resolve(__dirname, '..', '..', '..', '.specwave', 'assistant-state.json');
}

function resolveApprovalRiskLevels(): OrchestratorRiskLevel[] {
  const raw = process.env.SPECWAVE_ORCHESTRATOR_APPROVAL_RISK_LEVELS?.trim();
  if (!raw) return ['R3'];
  const levels = raw
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter((item): item is OrchestratorRiskLevel => item === 'R0' || item === 'R1' || item === 'R2' || item === 'R3');
  return levels.length > 0 ? levels : ['R3'];
}

async function main() {
  const port = Number(process.env.SPECWAVE_ORCHESTRATOR_PORT ?? '8787');
  const host = process.env.SPECWAVE_ORCHESTRATOR_HOST ?? '127.0.0.1';
  const tickIntervalMs = Number(process.env.SPECWAVE_ORCHESTRATOR_TICK_MS ?? '60000');
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`非法端口：${process.env.SPECWAVE_ORCHESTRATOR_PORT}`);
  }
  if (!Number.isFinite(tickIntervalMs) || tickIntervalMs < 1000) {
    throw new Error(`非法 tick 周期：${process.env.SPECWAVE_ORCHESTRATOR_TICK_MS}`);
  }

  const statePath = resolveStatePath();
  const assistantStatePath = resolveAssistantStatePath();
  const approvalRequiredRiskLevels = resolveApprovalRiskLevels();
  const connectorConfig = await loadConnectorConfig();
  const agentRuntime = connectorConfig.agentBridge?.enabled ? createAgentRuntime(connectorConfig.agentBridge) : undefined;
  const desktopAutomation = connectorConfig.desktopAutomation?.enabled
    ? createDesktopAutomation(connectorConfig.desktopAutomation)
    : undefined;
  const notificationSender = new AppNotificationSender(connectorConfig);
  const store = new JsonFileStateStore(statePath);
  const service = new OrchestratorService(store, {
    approvalRequiredRiskLevels,
    notificationSender
  });
  await service.initialize();
  const assistantStore = new JsonFileAssistantStateStore(assistantStatePath);
  const assistantService = new AssistantService(assistantStore, {
    agentRuntime
  });
  await assistantService.initialize();
  const streamBridge = connectorConfig.dingtalkStream
    ? await startDingtalkStreamBridge(service, connectorConfig.dingtalkStream, agentRuntime, desktopAutomation)
    : null;
  const telegramBridge =
    connectorConfig.telegram && connectorConfig.telegram.mode === 'polling'
      ? await startTelegramPollingBridge(service, connectorConfig.telegram, agentRuntime)
      : null;
  const proactiveGreeting = startProactiveGreeting(connectorConfig);
  const running = await startHttpServer(service, {
    port,
    host,
    assistantService,
    dingtalkAppbot: connectorConfig.dingtalkAppbot,
    telegram: connectorConfig.telegram,
    agentRuntime,
    desktopAutomation
  });
  const channels = ['internal'];
  if (connectorConfig.dingtalk?.webhook) channels.push('dingtalk');
  if (connectorConfig.dingtalkAppbot) channels.push('dingtalk-appbot');
  if (connectorConfig.dingtalkStream) channels.push('dingtalk-stream');
  if (connectorConfig.telegram) channels.push(`telegram-${connectorConfig.telegram.mode}`);
  if (agentRuntime) channels.push(`agent-${connectorConfig.agentBridge?.backend}`);
  if (desktopAutomation) channels.push(`desktop-${connectorConfig.desktopAutomation?.backend}`);
  if (connectorConfig.proactiveGreeting?.enabled) channels.push('proactive-greeting');

  const timer = setInterval(() => {
    void service.tick().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[orchestrator] tick failed: ${message}`);
    });
  }, tickIntervalMs);
  timer.unref();

  const address = running.address;
  console.log(
    `[orchestrator] listening at http://${address?.address ?? host}:${address?.port ?? port} state=${statePath} assistantState=${assistantStatePath} approval=${approvalRequiredRiskLevels.join(',')} channels=${channels.join(',')}`
  );

  const shutdown = async (signal: string) => {
    clearInterval(timer);
    console.log(`[orchestrator] received ${signal}, shutting down...`);
    try {
      streamBridge?.close();
      telegramBridge?.close();
      proactiveGreeting?.close();
      await running.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

void main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[orchestrator] startup failed: ${message}`);
  process.exit(1);
});
