import React from 'react';
import type { CodexCapabilitiesVM, UIIntent } from '@specwave/contracts';
import { Boxes, Download, FolderOpen, RefreshCw, Wrench } from 'lucide-react';

import { Badge } from '../../../primitives/Badge';
import { Alert, AlertDescription, AlertTitle } from '../../../primitives/shadcn/ui/alert';
import { Button } from '../../../primitives/shadcn/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../primitives/shadcn/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../../primitives/shadcn/ui/dialog';
import { ScrollArea } from '../../../primitives/shadcn/ui/scroll-area';
import { Textarea } from '../../../primitives/shadcn/textarea';

type CodexIntent = Extract<
  UIIntent,
  | { type: 'CODEX_CAPABILITIES_REFRESH' }
  | { type: 'CODEX_MCP_INSTALL_FROM_JSON' }
  | { type: 'CODEX_SKILL_INSTALL_OPEN' }
>;

function labelForHealth(state: CodexCapabilitiesVM['mcpServers'][number]['health']['state']) {
  switch (state) {
    case 'ok':
      return { text: '可用', tone: 'primary' as const };
    case 'error':
      return { text: '不可用', tone: 'accent' as const };
    case 'checking':
      return { text: '检测中', tone: 'secondary' as const };
    default:
      return { text: '未知', tone: 'default' as const };
  }
}

function safeJsonPreview(rawJson: string): { ok: true; preview: string } | { ok: false; error: string } {
  try {
    const obj = JSON.parse(rawJson) as any;
    if (!obj || typeof obj !== 'object') return { ok: false, error: '不是有效的 JSON 对象。' };
    const name = typeof obj.name === 'string' ? obj.name : '';
    const type = obj.transport?.type;
    const transportType = type === 'stdio' || type === 'http' ? type : '';
    const command = typeof obj.transport?.command === 'string' ? obj.transport.command : null;
    const args = Array.isArray(obj.transport?.args) ? obj.transport.args.filter((x: any) => typeof x === 'string') : null;
    const url = typeof obj.transport?.url === 'string' ? obj.transport.url : null;
    const envObj = obj.transport?.env && typeof obj.transport.env === 'object' ? obj.transport.env : null;
    const envKeys = envObj ? Object.keys(envObj).filter((k) => typeof k === 'string') : [];
    const preview = JSON.stringify({ name, transport: { type: transportType, command, args, url, envKeys } }, null, 2);
    return { ok: true, preview };
  } catch (err) {
    return { ok: false, error: 'JSON 解析失败。' };
  }
}

export function CodexCapabilitiesView(props: { vm: CodexCapabilitiesVM; dispatch: (intent: CodexIntent) => void }) {
  const [mcpInstallOpen, setMcpInstallOpen] = React.useState(false);
  const [skillInstallOpen, setSkillInstallOpen] = React.useState(false);
  const [mcpInstallJson, setMcpInstallJson] = React.useState('');

  const installingMcp = props.vm.install.isInstallingMcp;
  const installingSkill = props.vm.install.isInstallingSkill;

  const parsedPreview = React.useMemo(() => safeJsonPreview(mcpInstallJson), [mcpInstallJson]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" aria-hidden={true} />
          <div className="text-[12px] font-semibold">能力</div>
          <div className="text-[11px] text-muted-foreground">
            {props.vm.lastCheckedAt ? `最近探测：${new Date(props.vm.lastCheckedAt).toLocaleString()}` : '尚未探测'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-8 w-8 shadow-none"
            aria-label="刷新"
            title="刷新"
            disabled={props.vm.isChecking || installingMcp || installingSkill}
            onClick={() => props.dispatch({ type: 'CODEX_CAPABILITIES_REFRESH' })}
          >
            <RefreshCw className={props.vm.isChecking ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden={true} />
          </Button>
        </div>
      </div>

      {props.vm.error ? (
        <div className="px-3 pt-3">
          <Alert variant="destructive">
            <AlertTitle>能力探测失败</AlertTitle>
            <AlertDescription>
              <div className="whitespace-pre-wrap text-xs leading-relaxed">{props.vm.error}</div>
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      {props.vm.install.lastError || props.vm.install.lastMessage ? (
        <div className="px-3 pt-3">
          <Alert variant={props.vm.install.lastError ? 'destructive' : 'default'}>
            <AlertTitle>{props.vm.install.lastError ? '操作失败' : '操作完成'}</AlertTitle>
            <AlertDescription>
              <div className="whitespace-pre-wrap text-xs leading-relaxed">
                {props.vm.install.lastError ?? props.vm.install.lastMessage ?? ''}
              </div>
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 px-3 py-3">
        <ScrollArea className="h-full rounded-md border-2 bg-muted/10">
          <div className="space-y-3 p-3">
            <Card className="shadow-none">
              <CardHeader className="px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Boxes className="h-4 w-4 text-muted-foreground" aria-hidden={true} />
                    MCP
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 px-2 text-[12px] shadow-none"
                    onClick={() => setMcpInstallOpen(true)}
                    disabled={installingMcp || installingSkill}
                  >
                    <Download className="mr-1 h-4 w-4" aria-hidden={true} />
                    安装 MCP
                  </Button>
                </div>
                <div className="text-[11px] text-muted-foreground">来源：官方 `codex mcp list/get/add/remove`。</div>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                {props.vm.mcpServers.length === 0 ? (
                  <div className="rounded-md border-2 bg-background p-3 text-xs text-muted-foreground">
                    暂无已配置的 MCP。可以点“安装 MCP”导入。
                  </div>
                ) : (
                  <div className="space-y-2">
                    {props.vm.mcpServers.map((s) => {
                      const status = labelForHealth(s.health.state);
                      return (
                        <div key={s.name} className="rounded-md border-2 bg-background p-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate font-mono text-[12px]">{s.name}</span>
                                <span className="text-[11px] text-muted-foreground">{s.transportType}</span>
                                {!s.enabled ? <span className="text-[11px] text-muted-foreground">已禁用</span> : null}
                              </div>
                              {s.health.message ? (
                                <div className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">{s.health.message}</div>
                              ) : null}
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                {s.safeConfig.url ? (
                                  <span className="font-mono">{s.safeConfig.url}</span>
                                ) : s.safeConfig.command ? (
                                  <span className="font-mono">{s.safeConfig.command}</span>
                                ) : (
                                  <span className="font-mono">（无配置）</span>
                                )}
                                {s.safeConfig.args && s.safeConfig.args.length > 0 ? (
                                  <span className="ml-2 font-mono opacity-80">{s.safeConfig.args.join(' ')}</span>
                                ) : null}
                              </div>
                              {s.safeConfig.envKeys && s.safeConfig.envKeys.length > 0 ? (
                                <div className="mt-1 text-[11px] text-muted-foreground">
                                  env：<span className="font-mono">{s.safeConfig.envKeys.join(', ')}</span>
                                </div>
                              ) : null}
                            </div>
                            <Badge tone={status.tone} className="shrink-0">
                              {status.text}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-none">
              <CardHeader className="px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Boxes className="h-4 w-4 text-muted-foreground" aria-hidden={true} />
                    技能
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 px-2 text-[12px] shadow-none"
                    onClick={() => setSkillInstallOpen(true)}
                    disabled={installingMcp || installingSkill}
                  >
                    <Download className="mr-1 h-4 w-4" aria-hidden={true} />
                    安装技能
                  </Button>
                </div>
                <div className="text-[11px] text-muted-foreground">来源：官方 `~/.codex/skills` 与 `$CWD/.codex/skills`。</div>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                {props.vm.skills.length === 0 ? (
                  <div className="rounded-md border-2 bg-background p-3 text-xs text-muted-foreground">
                    暂无已安装的技能。可以点“安装技能”导入。
                  </div>
                ) : (
                  <div className="space-y-2">
                    {props.vm.skills.map((s) => {
                      const status = labelForHealth(s.health.state);
                      return (
                        <div key={`${s.location}:${s.id}`} className="rounded-md border-2 bg-background p-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate font-mono text-[12px]">{s.name || s.id}</span>
                                <span className="text-[11px] text-muted-foreground">{s.location === 'user' ? '用户' : '项目'}</span>
                              </div>
                              {s.description ? (
                                <div className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">{s.description}</div>
                              ) : null}
                              {s.health.message ? (
                                <div className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">{s.health.message}</div>
                              ) : null}
                            </div>
                            <Badge tone={status.tone} className="shrink-0">
                              {status.text}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </div>

      <Dialog
        open={mcpInstallOpen}
        onOpenChange={(open) => {
          if (!open && installingMcp) return;
          setMcpInstallOpen(open);
        }}
      >
        <DialogContent className="max-w-[720px] border-2 shadow-none">
          <DialogHeader>
            <DialogTitle>安装 MCP（JSON 导入）</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              说明：确认后会调用官方 `codex mcp add` 写入配置。不会在界面展示任何 `env` 明文值。
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr]">
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">输入 JSON</div>
                <Textarea
                  value={mcpInstallJson}
                  onChange={(e) => setMcpInstallJson(e.target.value)}
                  className="min-h-[220px] text-xs shadow-none focus-visible:ring-0"
                  placeholder='{"name":"example","transport":{"type":"stdio","command":"node","args":["..."],"env":{"TOKEN":"..."} } }'
                />
                {!mcpInstallJson.trim() ? (
                  <div className="text-[11px] text-muted-foreground">粘贴一段 JSON 后会自动生成脱敏预览。</div>
                ) : parsedPreview.ok ? null : (
                  <div className="text-[11px] text-destructive">{parsedPreview.error}</div>
                )}
              </div>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">脱敏预览</div>
                <pre className="min-h-[220px] whitespace-pre-wrap rounded-md border-2 bg-background p-2 text-[11px]">
                  {parsedPreview.ok ? parsedPreview.preview : '（无法预览）'}
                </pre>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" className="shadow-none" onClick={() => setMcpInstallOpen(false)} disabled={installingMcp}>
              取消
            </Button>
            <Button
              className="shadow-none"
              onClick={() => props.dispatch({ type: 'CODEX_MCP_INSTALL_FROM_JSON', rawJson: mcpInstallJson })}
              disabled={!mcpInstallJson.trim() || !parsedPreview.ok || installingMcp}
            >
              {installingMcp ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden={true} />
                  安装中…
                </>
              ) : (
                '安装'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={skillInstallOpen}
        onOpenChange={(open) => {
          if (!open && installingSkill) return;
          setSkillInstallOpen(open);
        }}
      >
        <DialogContent className="max-w-[720px] border-2 shadow-none">
          <DialogHeader>
            <DialogTitle>安装技能</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">支持 `zip`、单个 `md`，或包含 `SKILL.md` 的目录。</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-md border-2 bg-background p-3">
                <div className="text-xs font-semibold">安装到用户</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shadow-none"
                    onClick={() => {
                      setSkillInstallOpen(false);
                      props.dispatch({ type: 'CODEX_SKILL_INSTALL_OPEN', sourceKind: 'zip', targetScope: 'user' });
                    }}
                    disabled={installingSkill}
                  >
                    <Download className="mr-1 h-4 w-4" aria-hidden={true} />
                    zip
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shadow-none"
                    onClick={() => {
                      setSkillInstallOpen(false);
                      props.dispatch({ type: 'CODEX_SKILL_INSTALL_OPEN', sourceKind: 'md', targetScope: 'user' });
                    }}
                    disabled={installingSkill}
                  >
                    <Download className="mr-1 h-4 w-4" aria-hidden={true} />
                    md
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shadow-none"
                    onClick={() => {
                      setSkillInstallOpen(false);
                      props.dispatch({ type: 'CODEX_SKILL_INSTALL_OPEN', sourceKind: 'dir', targetScope: 'user' });
                    }}
                    disabled={installingSkill}
                  >
                    <FolderOpen className="mr-1 h-4 w-4" aria-hidden={true} />
                    目录
                  </Button>
                </div>
              </div>
              <div className="rounded-md border-2 bg-background p-3">
                <div className="text-xs font-semibold">安装到项目</div>
                <div className="mt-2 text-[11px] text-muted-foreground">目标：$CWD/.codex/skills（以当前项目根目录为准）</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shadow-none"
                    onClick={() => {
                      setSkillInstallOpen(false);
                      props.dispatch({ type: 'CODEX_SKILL_INSTALL_OPEN', sourceKind: 'zip', targetScope: 'project' });
                    }}
                    disabled={installingSkill}
                  >
                    <Download className="mr-1 h-4 w-4" aria-hidden={true} />
                    zip
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shadow-none"
                    onClick={() => {
                      setSkillInstallOpen(false);
                      props.dispatch({ type: 'CODEX_SKILL_INSTALL_OPEN', sourceKind: 'md', targetScope: 'project' });
                    }}
                    disabled={installingSkill}
                  >
                    <Download className="mr-1 h-4 w-4" aria-hidden={true} />
                    md
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shadow-none"
                    onClick={() => {
                      setSkillInstallOpen(false);
                      props.dispatch({ type: 'CODEX_SKILL_INSTALL_OPEN', sourceKind: 'dir', targetScope: 'project' });
                    }}
                    disabled={installingSkill}
                  >
                    <FolderOpen className="mr-1 h-4 w-4" aria-hidden={true} />
                    目录
                  </Button>
                </div>
              </div>
            </div>
            <div className="rounded-md border-2 bg-muted/10 p-3 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-2">
                <Boxes className="h-4 w-4" aria-hidden={true} />
                <span>如果选择的是 `SKILL.md` 文件，会安装该文件所在目录的全部内容。</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" className="shadow-none" onClick={() => setSkillInstallOpen(false)} disabled={installingSkill}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
