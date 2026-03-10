import type { AgentRuntime } from './agentRuntime';
import type { OrchestratorService } from './orchestratorService';
import type { TelegramConnectorConfig } from './connectorConfig';
import { getTelegramUpdates, sendTelegramMessage } from './telegramApi';
import { handleTelegramBotInbound } from './telegramBot';

type RunningBridge = {
  close: () => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function startTelegramPollingBridge(
  service: OrchestratorService,
  config: TelegramConnectorConfig,
  agentRuntime?: AgentRuntime
): Promise<RunningBridge> {
  let closed = false;
  let offset: number | undefined;
  const aborter = new AbortController();

  const runLoop = async () => {
    while (!closed) {
      const updates = await getTelegramUpdates(
        {
          apiBaseUrl: config.apiBaseUrl,
          botToken: config.botToken
        },
        {
          offset,
          timeoutSec: config.pollingTimeoutSec,
          limit: 50,
          signal: aborter.signal
        }
      );

      if (!updates.ok) {
        if (!closed) {
          console.error(`[orchestrator] telegram polling failed: ${updates.error}`);
          await sleep(config.pollingBackoffMs);
        }
        continue;
      }

      for (const update of updates.updates) {
        if (closed) break;
        offset = update.update_id + 1;
        try {
          const result = await handleTelegramBotInbound(service, update, {
            tenantId: config.tenantId,
            projectId: config.projectId,
            requireMention: config.requireMention,
            botUsername: config.botUsername,
            allowedChatIds: config.allowedChatIds,
            agentRuntime
          });
          if (!result.replyText) continue;
          const sent = await sendTelegramMessage(
            {
              apiBaseUrl: config.apiBaseUrl,
              botToken: config.botToken
            },
            {
              chatId: result.chatId,
              text: result.replyText,
              replyToMessageId: result.replyToMessageId
            }
          );
          if (!sent.ok) {
            console.error(`[orchestrator] telegram send reply failed: ${sent.error}`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[orchestrator] telegram update handle failed: ${message}`);
        }
      }
    }
  };

  void runLoop();
  console.log('[orchestrator] telegram polling bridge started');

  return {
    close: () => {
      closed = true;
      aborter.abort();
    }
  };
}
