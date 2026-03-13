import path from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { fixtureProjectPath, launchDesktopApp } from './helpers/desktopApp';

async function openMainWindowFromRecent(args: {
  app: ElectronApplication;
  welcomeWindow: Page;
  projectName: string;
}) {
  const mainWindowPromise = args.app.waitForEvent('window');
  await args.welcomeWindow.getByRole('button', { name: new RegExp(`^${args.projectName}`) }).click();
  const mainWindow = await mainWindowPromise;
  await mainWindow.waitForLoadState('domcontentloaded');
  await expect(mainWindow.getByLabel('TopBar')).toBeVisible();
  return mainWindow;
}

test.describe('桌面端欢迎页与主界面', () => {
  test('欢迎页展示最近项目并可进入主界面', async () => {
    const projectName = path.basename(fixtureProjectPath);
    const desktop = await launchDesktopApp({ recentProjectPaths: [fixtureProjectPath] });

    try {
      await expect(desktop.welcomeWindow.getByLabel('欢迎页')).toBeVisible();
      await expect(desktop.welcomeWindow.getByRole('region', { name: '历史项目' })).toContainText(projectName);

      const mainWindow = await openMainWindowFromRecent({
        app: desktop.app,
        welcomeWindow: desktop.welcomeWindow,
        projectName
      });

      await expect(mainWindow.getByLabel('TopBar')).toContainText(projectName);
      await expect(mainWindow.getByLabel('StatusBar')).toContainText(fixtureProjectPath);
    } finally {
      await desktop.close();
    }
  });

  test('主界面支持主题与皮肤切换', async () => {
    const projectName = path.basename(fixtureProjectPath);
    const desktop = await launchDesktopApp({ recentProjectPaths: [fixtureProjectPath] });

    try {
      const mainWindow = await openMainWindowFromRecent({
        app: desktop.app,
        welcomeWindow: desktop.welcomeWindow,
        projectName
      });

      const themeButton = mainWindow.getByRole('button', { name: '皮肤' });
      const initialTheme = await mainWindow.evaluate(() => document.documentElement.dataset.theme ?? 'light');
      const initialSkin = await mainWindow.evaluate(() => document.documentElement.dataset.skin ?? 'blue');

      await themeButton.click();
      await expect
        .poll(() => mainWindow.evaluate(() => document.documentElement.dataset.theme ?? 'light'))
        .not.toBe(initialTheme);

      await themeButton.click({ modifiers: ['Shift'] });
      await expect
        .poll(() => mainWindow.evaluate(() => document.documentElement.dataset.skin ?? 'blue'))
        .not.toBe(initialSkin);
    } finally {
      await desktop.close();
    }
  });
});
