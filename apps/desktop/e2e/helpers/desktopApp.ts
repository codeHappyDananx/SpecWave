import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

export const fixtureProjectPath = path.join(process.cwd(), 'e2e', 'fixtures', 'demo-project');

type LaunchDesktopAppResult = {
  app: ElectronApplication;
  welcomeWindow: Page;
  userDataDir: string;
  close: () => Promise<void>;
};

async function seedRecentProjects(userDataDir: string, projectPaths: string[]) {
  const records = projectPaths.map((projectPath, index) => ({
    path: projectPath,
    lastOpenedAt: Date.now() - index
  }));

  await fs.writeFile(path.join(userDataDir, 'recent-projects.json'), JSON.stringify(records, null, 2), 'utf8');
}

export async function launchDesktopApp(args: { recentProjectPaths?: string[] } = {}): Promise<LaunchDesktopAppResult> {
  const recentProjectPaths = args.recentProjectPaths ?? [];
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specwave-e2e-'));

  if (recentProjectPaths.length > 0) {
    await seedRecentProjects(userDataDir, recentProjectPaths);
  }

  const app = await electron.launch({
    cwd: process.cwd(),
    args: ['dist-electron/main/index.js'],
    env: {
      ...process.env,
      SPECWAVE_DISABLE_GPU: '1',
      SPECWAVE_OPEN_DEVTOOLS: '0',
      SPECWAVE_TEST_MODE: '1',
      SPECWAVE_USER_DATA_DIR: userDataDir
    }
  });

  const welcomeWindow = await app.firstWindow();
  await welcomeWindow.waitForLoadState('domcontentloaded');

  return {
    app,
    welcomeWindow,
    userDataDir,
    close: async () => {
      await app.close();
      await fs.rm(userDataDir, { recursive: true, force: true });
    }
  };
}

