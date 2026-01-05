import React from 'react';
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

type LeftIntent = Extract<UIIntent, { type: 'EXPLORER_TOGGLE_DIR' } | { type: 'EXPLORER_OPEN_FILE' } | { type: 'EXPLORER_SHOW_IGNORED_SET' }>;

export type LeftPanelProps = {
  explorer: AppViewModel['explorer'];
  globalSearchQuery: string;
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

export function LeftPanel(props: LeftPanelProps) {
  const iconClassName = 'text-ring/70';
  const chevronClassName = 'text-ring/50 transition-transform';
  const menuButtonClassName = 'text-[11px]';

  const visibleNodes = (nodes: AppViewModel['explorer']['workspace'][number][]) => {
    if (props.explorer.showIgnored) return nodes;
    return nodes.filter((n) => !n.isIgnored);
  };

  const renderNode = (tree: 'workspace' | 'project', node: AppViewModel['explorer']['workspace'][number]) => {
    const isExpanded = props.explorer.expanded[tree].includes(node.id);
    const isSelected = props.explorer.selectedPath === node.id;

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
            <SidebarMenuButton type="button" size="sm" className={menuButtonClassName} aria-label={`目录：${node.name}`}>
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
                    <div className="px-2 py-2 text-xs text-muted-foreground">未找到 .specwave/workspace（该目录不是 SpecWave 项目或未初始化）。</div>
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
    </Panel>
  );
}
