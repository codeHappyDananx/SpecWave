import React from 'react';
import { createPortal } from 'react-dom';
import type { AppViewModel, UIIntent } from '@specwave/contracts';
import {
  Check,
  ChevronRight,
  EyeOff,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileCog,
  FileImage,
  FileJson,
  FileLock,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  FileVideo,
  Folder
} from 'lucide-react';
import { Panel } from '../../primitives/Panel';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../primitives/shadcn/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarProvider
} from '../../primitives/shadcn/sidebar';
import { StoryCardInExplorer } from './StoryCardInExplorer';
import { SpecWaveInitDialog, SpecWaveUninitializedCard } from './SpecWaveInitGuide';
import { LeftRailSwitcher } from './LeftRailSwitcher';
import { CodexCapabilitiesView } from './codexCapabilities/CodexCapabilitiesView';

type LeftIntent = Extract<
  UIIntent,
  | { type: 'EXPLORER_TOGGLE_DIR' }
  | { type: 'EXPLORER_OPEN_FILE' }
  | { type: 'EXPLORER_SHOW_IGNORED_SET' }
  | { type: 'EXPLORER_REVEAL_IN_OS' }
  | { type: 'SPECWAVE_INIT_OPEN' }
  | { type: 'SPECWAVE_INIT_START' }
  | { type: 'SPECWAVE_INIT_RETRY' }
  | { type: 'SPECWAVE_INIT_CLOSE' }
  | { type: 'SPECWAVE_INIT_COPY_ERROR' }
  | { type: 'TERMINAL_COPY' }
  | { type: 'STORY_CARD_SELECT' }
  | { type: 'LEFT_PANEL_TAB_SET' }
  | { type: 'CODEX_CAPABILITIES_REFRESH' }
  | { type: 'CODEX_MCP_INSTALL_FROM_JSON' }
  | { type: 'CODEX_SKILL_INSTALL_OPEN' }
>;

export type LeftPanelProps = {
  explorer: AppViewModel['explorer'];
  leftTab: AppViewModel['leftTab'];
  codexCapabilities: AppViewModel['codexCapabilities'];
  globalSearchQuery: string;
  activeStoryId: string | null;
  dispatch: (intent: LeftIntent) => void;
  minwPx: number;
};

function iconForFileName(name: string) {
  const lower = name.toLowerCase();

  if (lower === '.env' || lower.startsWith('.env.')) return FileLock;
  if (lower.endsWith('.lock')) return FileLock;

  const dot = lower.lastIndexOf('.');
  const ext = dot > 0 ? lower.slice(dot + 1) : '';

  if (ext === 'md' || ext === 'txt') return FileText;
  if (ext === 'json') return FileJson;

  if (
    ext === 'ts' ||
    ext === 'tsx' ||
    ext === 'js' ||
    ext === 'jsx' ||
    ext === 'mjs' ||
    ext === 'cjs' ||
    ext === 'css' ||
    ext === 'scss' ||
    ext === 'less' ||
    ext === 'html' ||
    ext === 'vue' ||
    ext === 'py' ||
    ext === 'go' ||
    ext === 'rs' ||
    ext === 'java' ||
    ext === 'kt' ||
    ext === 'c' ||
    ext === 'cc' ||
    ext === 'cpp' ||
    ext === 'h' ||
    ext === 'hpp' ||
    ext === 'cs'
  )
    return FileCode;

  if (ext === 'yml' || ext === 'yaml' || ext === 'toml' || ext === 'ini') return FileCog;
  if (ext === 'bat' || ext === 'cmd' || ext === 'sh' || ext === 'ps1') return FileTerminal;

  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'webp' || ext === 'svg' || ext === 'ico')
    return FileImage;

  if (ext === 'mp3' || ext === 'wav' || ext === 'flac' || ext === 'ogg' || ext === 'm4a') return FileAudio;
  if (ext === 'mp4' || ext === 'mov' || ext === 'webm' || ext === 'mkv' || ext === 'avi') return FileVideo;

  if (ext === 'zip' || ext === 'rar' || ext === '7z' || ext === 'tar' || ext === 'gz') return FileArchive;
  if (ext === 'csv' || ext === 'xls' || ext === 'xlsx') return FileSpreadsheet;

  return File;
}

export const LeftPanel = React.memo(function LeftPanel(props: LeftPanelProps) {
  const iconClassName = 'text-ring/70';
  const chevronClassName = 'text-ring/50 transition-transform';
  const menuButtonClassName = 'text-[11px]';

  const [contextMenu, setContextMenu] = React.useState<{
    open: boolean;
    x: number;
    y: number;
    target: { path: string; name: string; kind: 'dir' | 'file' } | null;
  }>({ open: false, x: 0, y: 0, target: null });
  const contextMenuRef = React.useRef<HTMLDivElement | null>(null);

  const closeContextMenu = React.useCallback(() => {
    setContextMenu((prev) => (prev.open ? { open: false, x: prev.x, y: prev.y, target: null } : prev));
  }, []);

  React.useEffect(() => {
    if (!contextMenu.open) return;
    const onPointerDown = () => closeContextMenu();
    const onBlur = () => closeContextMenu();
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('scroll', onPointerDown, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('scroll', onPointerDown, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [closeContextMenu, contextMenu.open]);

  React.useLayoutEffect(() => {
    if (!contextMenu.open) return;
    const el = contextMenuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let nextX = contextMenu.x;
    let nextY = contextMenu.y;
    if (rect.right > window.innerWidth - pad) nextX = Math.max(pad, contextMenu.x - rect.width);
    if (rect.bottom > window.innerHeight - pad) nextY = Math.max(pad, contextMenu.y - rect.height);
    if (nextX !== contextMenu.x || nextY !== contextMenu.y) {
      setContextMenu((prev) => (prev.open ? { ...prev, x: nextX, y: nextY } : prev));
    }
  }, [contextMenu.open, contextMenu.x, contextMenu.y]);

  const detectSep = (p: string) => (p.includes('/') ? '/' : '\\');
  const normalizeFsPath = (p: string) => p.replaceAll('\\', '/').replaceAll(/\/+/g, '/').replaceAll(/\/+$/g, '');
  const relativeToRoot = (candidatePath: string, root: string) => {
    const candidateNorm = normalizeFsPath(candidatePath);
    const rootNorm = normalizeFsPath(root);
    const cLower = candidateNorm.toLowerCase();
    const rLower = rootNorm.toLowerCase();
    if (cLower === rLower) return '';
    const prefix = `${rootNorm}/`;
    if (!cLower.startsWith(prefix.toLowerCase())) return null;
    const rel = candidateNorm.slice(prefix.length);
    const sep = detectSep(candidatePath);
    return sep === '/' ? rel : rel.replaceAll('/', sep);
  };

  const copyToClipboard = (text: string) => props.dispatch({ type: 'TERMINAL_COPY', text });

  const getNodeFromEventTarget = (
    target: EventTarget | null
  ): { path: string; name: string; kind: 'dir' | 'file' } | null => {
    const el = (target as Element | null)?.closest?.('[data-sw-node-path]');
    if (!el) return null;
    const path = el.getAttribute('data-sw-node-path') ?? '';
    const name = el.getAttribute('data-sw-node-name') ?? '';
    const kindAttr = el.getAttribute('data-sw-node-kind');
    const kind = kindAttr === 'dir' || kindAttr === 'file' ? (kindAttr as 'dir' | 'file') : null;
    if (!path || !name || !kind) return null;
    return { path, name, kind };
  };

  const openContextMenu = (e: { preventDefault: () => void; stopPropagation: () => void; clientX: number; clientY: number }, target: {
    path: string;
    name: string;
    kind: 'dir' | 'file';
  }) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ open: true, x: e.clientX, y: e.clientY, target });
  };

  const onRightPointerDownCapture = (e: React.PointerEvent) => {
    if (e.button !== 2) return;
    const node = getNodeFromEventTarget(e.target);
    if (!node) return;
    openContextMenu(e, node);
  };

  const onContextMenuCapture = (e: React.MouseEvent) => {
    const node = getNodeFromEventTarget(e.target);
    if (!node) return;
    openContextMenu(e, node);
  };

  const visibleNodes = (nodes: AppViewModel['explorer']['workspace'][number][]) => {
    if (props.explorer.showIgnored) return nodes;
    return nodes.filter((n) => !n.isIgnored);
  };

  const renderNode = (tree: 'workspace' | 'project', node: AppViewModel['explorer']['workspace'][number]) => {
    const isExpanded = props.explorer.expanded[tree].includes(node.id);
    const isSelected = props.explorer.selectedPath === node.id;

    // 如果节点有 storyCard 数据，渲染 Story 卡片
    if (node.storyCard) {
      return (
        <SidebarMenuItem key={node.id}>
          <StoryCardInExplorer
            story={node.storyCard}
            isActive={isSelected || props.activeStoryId === node.storyCard.id}
            isArchived={node.isArchived ?? false}
            onClick={() => props.dispatch({ type: 'STORY_CARD_SELECT', storyId: node.storyCard!.id, storyPath: node.id })}
          />
        </SidebarMenuItem>
      );
    }

    if (node.kind !== 'dir') {
      const Icon = iconForFileName(node.name);
      return (
        <SidebarMenuButton
          key={node.id}
          type="button"
          size="sm"
          isActive={isSelected}
          aria-current={isSelected ? 'true' : 'false'}
          className={menuButtonClassName}
          onClick={() => props.dispatch({ type: 'EXPLORER_OPEN_FILE', path: node.id })}
          onPointerDown={(e) => {
            if (e.button !== 2) return;
            openContextMenu(e, { path: node.id, name: node.name, kind: 'file' });
          }}
          onContextMenu={(e) => openContextMenu(e, { path: node.id, name: node.name, kind: 'file' })}
          data-sw-node-path={node.id}
          data-sw-node-name={node.name}
          data-sw-node-kind="file"
        >
          <Icon className={iconClassName} aria-hidden={true} />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
        </SidebarMenuButton>
      );
    }

    return (
      <SidebarMenuItem key={node.id}>
        <Collapsible
          open={isExpanded}
          onOpenChange={(nextOpen) => {
            if (nextOpen === isExpanded) return;
            props.dispatch({ type: 'EXPLORER_TOGGLE_DIR', tree, id: node.id });
          }}
          className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
        >
          <CollapsibleTrigger asChild>
              <SidebarMenuButton
                type="button"
                size="sm"
                className={menuButtonClassName}
                aria-label={`目录：${node.name}`}
                onPointerDown={(e) => {
                  if (e.button !== 2) return;
                  openContextMenu(e, { path: node.id, name: node.name, kind: 'dir' });
                }}
                onContextMenu={(e) => openContextMenu(e, { path: node.id, name: node.name, kind: 'dir' })}
                data-sw-node-path={node.id}
                data-sw-node-name={node.name}
                data-sw-node-kind="dir"
              >
                <ChevronRight className={chevronClassName} aria-hidden={true} />
                <Folder className={iconClassName} aria-hidden={true} />
                <span className="min-w-0 flex-1 truncate">{node.name}</span>
              {node.isLoading ? <span className="text-[11px] text-muted-foreground">加载中…</span> : null}
            </SidebarMenuButton>
          </CollapsibleTrigger>

          <CollapsibleContent>
            {node.error ? (
              <div className="mx-2 mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                {node.error}
              </div>
            ) : null}

            {node.children ? (
              <SidebarMenuSub aria-label={`${node.name} 子节点`}>
                {visibleNodes(node.children).map((c) => renderNode(tree, c))}
              </SidebarMenuSub>
            ) : null}
          </CollapsibleContent>
        </Collapsible>
      </SidebarMenuItem>
    );
  };

  const query = props.globalSearchQuery.trim();
  const q = query.toLowerCase();

  const collectMatches = (tree: 'workspace' | 'project', nodes: AppViewModel['explorer']['workspace'][number][]) => {
    const hits: { tree: 'workspace' | 'project'; id: string; name: string; kind: 'dir' | 'file' }[] = [];
    const walk = (ns: AppViewModel['explorer']['workspace'][number][]) => {
      for (const n of ns) {
        if (!props.explorer.showIgnored && n.isIgnored) continue;
        if (q && n.name.toLowerCase().includes(q)) hits.push({ tree, id: n.id, name: n.name, kind: n.kind });
        if (n.kind === 'dir' && n.children) walk(n.children);
      }
    };
    walk(nodes);
    return hits;
  };

  const matches =
    q && props.explorer.projectRoot
      ? [...collectMatches('workspace', props.explorer.workspace), ...collectMatches('project', props.explorer.project)]
      : [];

  return (
    <Panel
      as="aside"
      ariaLabel="左区"
      bodyAriaLabel="左区滚动区"
      minwPx={props.minwPx}
      bodyBleed
    >
      <div className="flex h-full min-h-0">
        <LeftRailSwitcher tab={props.leftTab} dispatch={props.dispatch} />
        <div className="min-w-0 flex-1">
      <div
        className="h-full min-h-0"
        style={{ display: props.leftTab === 'workbench' ? 'block' : 'none' }}
        onPointerDownCapture={onRightPointerDownCapture}
        onContextMenuCapture={onContextMenuCapture}
      >
        <SidebarProvider className="h-full min-h-0 w-full">
          <Sidebar collapsible="none" className="h-full w-full">
          {!props.explorer.projectRoot ? (
            <div className="p-3" aria-label="未打开项目">
              <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">
                还未打开项目。点击顶部“打开项目”后，这里会显示工作区与项目文件树。
              </div>
            </div>
          ) : (
            <>
            <SidebarHeader>
              <SidebarMenu aria-label="浏览选项">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    size="sm"
                    isActive={props.explorer.showIgnored}
                    className={menuButtonClassName}
                    onClick={() => props.dispatch({ type: 'EXPLORER_SHOW_IGNORED_SET', showIgnored: !props.explorer.showIgnored })}
                  >
                    <EyeOff className={iconClassName} aria-hidden={true} />
                    <span className="min-w-0 flex-1 truncate">显示被忽略项</span>
                    {props.explorer.showIgnored ? <Check className={`ml-auto ${iconClassName}`} aria-hidden={true} /> : null}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
              {q ? (
                <SidebarGroup>
                  <SidebarGroupLabel>
                    <span>搜索结果</span>
                    <span className="text-xs text-muted-foreground">仅已加载节点，{matches.length} 条</span>
                  </SidebarGroupLabel>
                  <SidebarGroupContent className="text-[11px]">
                    {matches.length ? (
                      <SidebarMenu aria-label="搜索结果列表">
                        {matches.slice(0, 200).map((m) => {
                          const isActive = props.explorer.selectedPath === m.id;
                          return (
                          <SidebarMenuItem key={`${m.tree}:${m.id}`}>
                            <SidebarMenuButton
                              type="button"
                              size="sm"
                              isActive={isActive}
                              className={menuButtonClassName}
                              aria-label={`${m.kind === 'dir' ? '目录' : '文件'}：${m.name}`}
                              onClick={() => {
                                if (m.kind === 'dir') props.dispatch({ type: 'EXPLORER_TOGGLE_DIR', tree: m.tree, id: m.id });
                                else props.dispatch({ type: 'EXPLORER_OPEN_FILE', path: m.id });
                              }}
                              onPointerDown={(e) => {
                                if (e.button !== 2) return;
                                openContextMenu(e, { path: m.id, name: m.name, kind: m.kind });
                              }}
                              onContextMenu={(e) => openContextMenu(e, { path: m.id, name: m.name, kind: m.kind })}
                              data-sw-node-path={m.id}
                              data-sw-node-name={m.name}
                              data-sw-node-kind={m.kind}
                            >
                              {m.kind === 'dir' ? (
                                <Folder className={iconClassName} aria-hidden={true} />
                              ) : (
                                React.createElement(iconForFileName(m.name), { className: iconClassName, 'aria-hidden': true })
                              )}
                              <span className="min-w-0 flex-1 truncate">{m.name}</span>
                              <span className="shrink-0 text-xs text-muted-foreground">{m.tree === 'workspace' ? '工作区' : '项目'}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          );
                        })}
                        {matches.length > 200 ? (
                          <li className="px-2 py-1 text-xs text-muted-foreground">结果过多，仅展示前 200 条。</li>
                        ) : null}
                      </SidebarMenu>
                    ) : (
                      <div className="px-2 py-2 text-xs text-muted-foreground">没有匹配结果。</div>
                    )}
                  </SidebarGroupContent>
                </SidebarGroup>
              ) : null}

                <SidebarGroup>
                  <SidebarGroupLabel>SpecWave 工作区</SidebarGroupLabel>
                  <SidebarGroupContent className="text-[11px]">
                  {props.explorer.workspaceRoot ? (
                    <SidebarMenu aria-label="工作区树">{visibleNodes(props.explorer.workspace).map((n) => renderNode('workspace', n))}</SidebarMenu>
                  ) : (
                    <SpecWaveUninitializedCard dispatch={props.dispatch} />
                  )}
                </SidebarGroupContent>
              </SidebarGroup>

                <SidebarGroup>
                  <SidebarGroupLabel>项目文件</SidebarGroupLabel>
                  <SidebarGroupContent className="text-[11px]">
                    <SidebarMenu aria-label="项目文件树">{visibleNodes(props.explorer.project).map((n) => renderNode('project', n))}</SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>

              {props.explorer.error ? (
                <div className="mx-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                  {props.explorer.error}
                </div>
              ) : null}
            </SidebarContent>
            </>
          )}
        </Sidebar>
      </SidebarProvider>
      </div>

      <div className="h-full min-h-0" style={{ display: props.leftTab === 'codexCapabilities' ? 'block' : 'none' }}>
        <CodexCapabilitiesView vm={props.codexCapabilities} dispatch={props.dispatch} />
      </div>

      {props.leftTab === 'workbench' ? (
        <SpecWaveInitDialog init={props.explorer.specwaveInit} dispatch={props.dispatch} />
      ) : null}

      {props.leftTab === 'workbench' && contextMenu.open && contextMenu.target && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={contextMenuRef}
              role="menu"
              aria-label="文件操作"
              className="fixed z-[1000] min-w-[220px] rounded-md border bg-background p-1 text-xs"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onContextMenu={(e) => e.preventDefault()}
              onMouseDown={(e) => e.stopPropagation()}
            >
          <button
            type="button"
            className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-muted"
            onClick={() => {
              const p = contextMenu.target!.path;
                  const relFromProject = props.explorer.projectRoot ? relativeToRoot(p, props.explorer.projectRoot) : null;
                  const relFromWorkspace = props.explorer.workspaceRoot ? relativeToRoot(p, props.explorer.workspaceRoot) : null;
              const rel = relFromProject ?? relFromWorkspace ?? p;
              copyToClipboard(rel);
              closeContextMenu();
            }}
          >
            复制相对路径
          </button>
          <button
            type="button"
            className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-muted"
            onClick={() => {
              copyToClipboard(contextMenu.target!.path);
              closeContextMenu();
            }}
          >
            复制绝对路径
          </button>
          <button
            type="button"
            className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-muted"
            onClick={() => {
              copyToClipboard(contextMenu.target!.name);
                  closeContextMenu();
                }}
              >
                复制文件名
              </button>
              <div className="my-1 h-px bg-border" aria-hidden={true} />
              <button
                type="button"
                className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-muted"
                onClick={() => {
                  props.dispatch({ type: 'EXPLORER_REVEAL_IN_OS', path: contextMenu.target!.path });
                  closeContextMenu();
                }}
              >
                打开所在文件夹
              </button>
            </div>,
            document.body
          )
        : null}
        </div>
      </div>
    </Panel>
  );
});
