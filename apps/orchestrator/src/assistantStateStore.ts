import fs from 'node:fs/promises';
import path from 'node:path';
import type { ApprovalCheckpoint, AssistantOnboardingSession, ConversationSession, ExecutionEvidence, UserProfile } from '../../../packages/contracts/src/orchestrator';

export type AssistantStateSnapshot = {
  profiles: Record<string, UserProfile>;
  onboardingSessions: Record<string, AssistantOnboardingSession>;
  activeOnboardingSessionIdByUser: Record<string, string>;
  sessions: Record<string, ConversationSession>;
  transcriptsBySessionId: Record<string, Array<{ role: 'assistant' | 'user'; content: string; at: string }>>;
  evidencesBySessionId: Record<string, ExecutionEvidence[]>;
  approvals: Record<string, ApprovalCheckpoint>;
};

export class JsonFileAssistantStateStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<AssistantStateSnapshot | null> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(raw) as AssistantStateSnapshot;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async save(snapshot: AssistantStateSnapshot): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    await fs.rename(tmp, this.filePath);
  }
}
