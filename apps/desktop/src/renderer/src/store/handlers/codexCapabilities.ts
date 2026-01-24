import type { UIIntent } from '@specwave/contracts';

import type { AppState, StoreCtx } from '../types';

type IntentArgs = { ctx: StoreCtx; state: AppState; intent: UIIntent };

type InstallResult =
  | { ok: true; message?: string }
  | { ok: false; error: string; code?: 'already-exists' | 'invalid-input' | 'unsupported' | 'failed' };

function normalizeInstallResultMessage(res: InstallResult) {
  if (res.ok) return res.message ?? '安装成功。';
  return res.error || '安装失败。';
}

async function confirmOverwriteIfNeeded(args: {
  api: Window['specwave'];
  code?: string;
  title: string;
  detail: string;
}) {
  if (args.code !== 'already-exists') return false;
  const msg = await args.api.showMessageBox({
    title: args.title,
    message: '已存在同名项，是否覆盖安装？',
    detail: args.detail,
    buttons: ['取消', '覆盖安装'],
    defaultId: 1,
    cancelId: 0
  });
  return msg.ok && msg.response === 1;
}

export function handleCodexCapabilitiesIntent(args: IntentArgs): Partial<AppState> | null {
  const { ctx, state, intent } = args;
  const vm = state.vm;

  switch (intent.type) {
    case 'LEFT_PANEL_TAB_SET': {
      const nextVm = { ...vm, leftTab: intent.tab };
      if (intent.tab === 'codexCapabilities' && !vm.codexCapabilities.lastCheckedAt && !vm.codexCapabilities.isChecking) {
        queueMicrotask(() => ctx.dispatch({ type: 'CODEX_CAPABILITIES_REFRESH' }));
      }
      return { vm: nextVm };
    }
    case 'CODEX_CAPABILITIES_REFRESH': {
      const includeConnectivityProbe = intent.includeConnectivityProbe ?? vm.codexCapabilities.includeConnectivityProbe;
      const nextVm = {
        ...vm,
        codexCapabilities: {
          ...vm.codexCapabilities,
          includeConnectivityProbe,
          isChecking: true,
          error: null,
          install: { ...vm.codexCapabilities.install, lastError: null, lastMessage: null },
          mcpServers: vm.codexCapabilities.mcpServers.map((s) => ({
            ...s,
            health: { state: 'checking' as const, message: s.health.message }
          })),
          skills: vm.codexCapabilities.skills.map((s) => ({
            ...s,
            health: { state: 'checking' as const, message: s.health.message }
          }))
        }
      };

      void (async () => {
        const api = window.specwave;
        if (!api || !api.codexCapabilitiesProbe) {
          ctx.set((st) => ({
            vm: {
              ...st.vm,
              codexCapabilities: {
                ...st.vm.codexCapabilities,
                isChecking: false,
                error: '当前桌面端版本不支持能力探测。'
              }
            }
          }));
          return;
        }

        const res = await api.codexCapabilitiesProbe({
          includeConnectivityProbe,
          projectRoot: vm.explorer.projectRoot
        });

        ctx.set((st) => {
          if (st.vm.codexCapabilities.includeConnectivityProbe !== includeConnectivityProbe && intent.includeConnectivityProbe == null) {
            // 用户在探测期间改了开关，避免回写覆盖。
          }
          if (!res.ok) {
            return {
              vm: {
                ...st.vm,
                codexCapabilities: {
                  ...st.vm.codexCapabilities,
                  isChecking: false,
                  lastCheckedAt: new Date().toISOString(),
                  error: res.error,
                  install: { ...st.vm.codexCapabilities.install }
                }
              }
            };
          }
          return {
            vm: {
              ...st.vm,
              codexCapabilities: {
                ...st.vm.codexCapabilities,
                isChecking: false,
                lastCheckedAt: res.checkedAt,
                error: null,
                mcpServers: res.mcpServers,
                skills: res.skills
              }
            }
          };
        });
      })();

      return { vm: nextVm };
    }
    case 'CODEX_MCP_INSTALL_FROM_JSON': {
      const api = window.specwave;
      if (!api || !api.codexMcpInstallFromJson) return { vm };

      const nextVm = {
        ...vm,
        codexCapabilities: {
          ...vm.codexCapabilities,
          install: {
            ...vm.codexCapabilities.install,
            isInstallingMcp: true,
            lastError: null,
            lastMessage: null
          }
        }
      };

      void (async () => {
        const doInstall = async (overwrite: boolean): Promise<InstallResult> => {
          const res = await api.codexMcpInstallFromJson({ rawJson: intent.rawJson, overwrite });
          return res as InstallResult;
        };

        let res = await doInstall(Boolean(intent.overwrite));
        if (!res.ok) {
          const okOverwrite = await confirmOverwriteIfNeeded({
            api,
            code: res.code,
            title: '安装 MCP',
            detail: normalizeInstallResultMessage(res)
          });
          if (okOverwrite) res = await doInstall(true);
        }

        ctx.set((st) => ({
          vm: {
            ...st.vm,
            codexCapabilities: {
              ...st.vm.codexCapabilities,
              install: {
                ...st.vm.codexCapabilities.install,
                isInstallingMcp: false,
                lastError: res.ok ? null : res.error,
                lastMessage: res.ok ? normalizeInstallResultMessage(res) : null
              }
            }
          }
        }));

        if (res.ok) ctx.dispatch({ type: 'CODEX_CAPABILITIES_REFRESH' });
      })();

      return { vm: nextVm };
    }
    case 'CODEX_SKILL_INSTALL_OPEN': {
      const api = window.specwave;
      if (!api || !api.codexSkillInstall) return { vm };

      const nextVm = {
        ...vm,
        codexCapabilities: {
          ...vm.codexCapabilities,
          install: {
            ...vm.codexCapabilities.install,
            isInstallingSkill: true,
            lastError: null,
            lastMessage: null
          }
        }
      };

      void (async () => {
        const pickPath = async () => {
          if (intent.sourceKind === 'dir') return api.selectDirectory({ title: '选择技能目录' });
          if (!api.selectFile) return null;
          const filters =
            intent.sourceKind === 'zip'
              ? [{ name: 'zip', extensions: ['zip'] }]
              : [{ name: 'md', extensions: ['md'] }];
          const res = await api.selectFile({ title: '选择技能文件', filters });
          return res;
        };

        const sourcePath = await pickPath();
        if (!sourcePath) {
          ctx.set((st) => ({
            vm: {
              ...st.vm,
              codexCapabilities: {
                ...st.vm.codexCapabilities,
                install: { ...st.vm.codexCapabilities.install, isInstallingSkill: false }
              }
            }
          }));
          return;
        }

        const doInstall = async (overwrite: boolean): Promise<InstallResult> => {
          const res = await api.codexSkillInstall({
            source: { kind: intent.sourceKind, path: sourcePath },
            targetScope: intent.targetScope,
            projectRoot: vm.explorer.projectRoot,
            overwrite
          });
          return res as InstallResult;
        };

        let res = await doInstall(false);
        if (!res.ok) {
          const okOverwrite = await confirmOverwriteIfNeeded({
            api,
            code: res.code,
            title: '安装技能',
            detail: normalizeInstallResultMessage(res)
          });
          if (okOverwrite) res = await doInstall(true);
        }

        ctx.set((st) => ({
          vm: {
            ...st.vm,
            codexCapabilities: {
              ...st.vm.codexCapabilities,
              install: {
                ...st.vm.codexCapabilities.install,
                isInstallingSkill: false,
                lastError: res.ok ? null : res.error,
                lastMessage: res.ok ? normalizeInstallResultMessage(res) : null
              }
            }
          }
        }));

        if (res.ok) ctx.dispatch({ type: 'CODEX_CAPABILITIES_REFRESH' });
      })();

      return { vm: nextVm };
    }
    default:
      return null;
  }
}
