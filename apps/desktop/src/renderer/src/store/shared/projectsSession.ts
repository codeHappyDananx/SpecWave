import type { AppViewModel } from '@specwave/contracts';

// 关键处理节点：Renderer 意外刷新/热重载时，内存态的页签会丢失，表现为“过一会儿新增项目被关掉”。
// 这里用 sessionStorage 记住当前窗口的 openTabs/activeTabId，避免刷新把用户刚开的项目吞掉。
const PROJECTS_SESSION_KEY = 'specwave_projects_session_v1';

export function loadProjectsSession(): AppViewModel['projects'] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(PROJECTS_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed == null) return null;

    const obj = parsed as { openTabs?: unknown; activeTabId?: unknown };
    if (!Array.isArray(obj.openTabs)) return null;

    const openTabs: AppViewModel['projects']['openTabs'] = [];
    for (const item of obj.openTabs) {
      if (typeof item !== 'object' || item == null) return null;
      const tab = item as { id?: unknown; folderName?: unknown; path?: unknown };
      if (typeof tab.id !== 'string' || typeof tab.folderName !== 'string') return null;
      const path = tab.path;
      if (path !== null && typeof path !== 'string') return null;
      openTabs.push({ id: tab.id, folderName: tab.folderName, path });
    }

    let activeTabId: string | null = typeof obj.activeTabId === 'string' ? obj.activeTabId : null;
    if (activeTabId && !openTabs.some((t) => t.id === activeTabId)) activeTabId = openTabs[0]?.id ?? null;
    return { openTabs, activeTabId };
  } catch {
    return null;
  }
}

export function persistProjectsSession(projects: AppViewModel['projects']) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(PROJECTS_SESSION_KEY, JSON.stringify(projects));
  } catch {}
}

