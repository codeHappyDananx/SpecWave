import fs from 'node:fs/promises';
import path from 'node:path';
import type { OrchestratorStateSnapshot, OrchestratorStateStore } from './orchestratorService';

export class JsonFileStateStore implements OrchestratorStateStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<OrchestratorStateSnapshot | null> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as OrchestratorStateSnapshot;
      return parsed;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async save(snapshot: OrchestratorStateSnapshot): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    await fs.rename(tmp, this.filePath);
  }
}
