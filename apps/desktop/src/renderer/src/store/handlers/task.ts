import type { AppViewModel, TaskBoardVM, TaskItemVM, UIIntent } from '@specwave/contracts';

import type { AppState, StoreCtx } from '../types';
import { findMatchStarts } from '../shared/find';
import { normalizeFsPath } from '../shared/path';
import { loadLinkedDocs } from '../shared/linkedDocs';
import { selfWriteAtByPath } from '../shared/selfWriteSilence';
import { EMPTY_TASK_DETAIL, parseTaskBoardV2 } from '../shared/taskBoard';

function toggleCharAt(text: string, pos: number, nextChar: string) {
  if (pos < 0 || pos >= text.length) return text;
  return text.slice(0, pos) + nextChar + text.slice(pos + 1);
}

function detectNewline(text: string) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function normalizeNewlines(text: string, newline: string) {
  if (!text) return '';
  const normalized = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  if (newline === '\n') return normalized;
  return normalized.replaceAll('\n', newline);
}

function effectiveContentText(content: AppViewModel['content']) {
  return content.isDirty ? content.draftText : content.text;
}

function extractTaskDrafts(fullText: string, item: TaskItemVM) {
  const blockText = fullText.slice(item.source.blockStartPos, item.source.blockEndPos);
  const trimmed = blockText.trimEnd();
  const main = trimmed.replaceAll('\r\n', '\n');
  const nlIdx = main.indexOf('\n');
  const body = nlIdx < 0 ? '' : main.slice(nlIdx + 1).trimEnd();
  const title = fullText.slice(item.source.titleStartPos, item.source.titleEndPos).replace(/\r$/, '');
  return { title, body };
}

/**
 * Task handler（任务板/详情/关联文档跳转）
 *
 * - 处理 intent：
 *   - TASK_ITEM_TOGGLE / TASK_ITEM_OPEN / TASK_DETAIL_OPEN / TASK_DETAIL_CLOSE
 *   - TASK_DETAIL_MODE_SET / TASK_DETAIL_DRAFT_SET / TASK_DETAIL_SAVE
 *   - TASK_DECK_MODE_SET / TASK_DECK_PREV / TASK_DECK_NEXT / TASK_DECK_FOCUS
 *   - TASK_ITEM_START / TASK_LINKED_DOC_JUMP / TASK_LINKED_DOCS_TOGGLE_SECTION
 * - 读写的 VM 字段：content / terminal / rightVisible / rightMode
 * - 副作用：preload saveTextFile / readTextFile / terminalCreateSession / terminalWrite
 */
export function handleTaskIntent(args: { ctx: StoreCtx; state: AppState; intent: UIIntent }): Partial<AppState> | null {
  const { ctx, state, intent } = args;
  const vm = state.vm;

  switch (intent.type) {
    case 'TASK_ITEM_TOGGLE': {
      const file = vm.content.file;
      if (!file || file.kind !== 'task') return { vm };

      const effectiveText = vm.content.isDirty ? vm.content.draftText : vm.content.text;
      const currentChar = effectiveText[intent.source.statusPos] ?? ' ';
      const nextChar = currentChar.toLowerCase() === 'x' ? ' ' : 'x';
      const nextText = toggleCharAt(effectiveText, intent.source.statusPos, nextChar);

      void (async () => {
        const api = window.specwave;
        if (!api) return;
        const current = ctx.get().vm.content.file;
        if (!current || current.path !== file.path) return;
        const res = await api.saveTextFile(current.path, nextText, current.sha256);
        if (res.ok) selfWriteAtByPath.set(normalizeFsPath(current.path), Date.now());

        ctx.set((state2) => {
          const vm2 = state2.vm;
          if (!vm2.content.file || vm2.content.file.path !== file.path) return { vm: vm2 };

          if (!res.ok) {
            if ('conflict' in res && res.conflict) {
              return { vm: { ...vm2, content: { ...vm2.content, saveStatus: 'conflict', saveError: res.error } } };
            }
            return { vm: { ...vm2, content: { ...vm2.content, saveStatus: 'error', saveError: res.error } } };
          }

          return {
            vm: {
              ...vm2,
              content: {
                ...vm2.content,
                text: nextText,
                draftText: nextText,
                isDirty: false,
                saveStatus: 'saved',
                saveError: null,
                file: { ...vm2.content.file!, sha256: res.sha256 },
                taskBoard: parseTaskBoardV2(nextText, vm2.content.taskBoard)
              }
            }
          };
        });
      })();

      return {
        vm: {
          ...vm,
          content: {
            ...vm.content,
            draftText: nextText,
            isDirty: true,
            saveStatus: 'saving',
            saveError: null,
            taskBoard: parseTaskBoardV2(nextText, vm.content.taskBoard)
          }
        }
      };
    }
    case 'TASK_ITEM_OPEN': {
      const file = vm.content.file;
      if (!file || file.kind !== 'task') return { vm };
      const text = effectiveContentText(vm.content);
      const board = vm.content.taskBoard ?? parseTaskBoardV2(text, null);
      const item = board.items.find((t) => t.id === intent.taskId);
      if (!item) return { vm: { ...vm, content: { ...vm.content, taskBoard: board } } };
      const { title, body } = extractTaskDrafts(text, item);
      const nextBoard: TaskBoardVM = {
        ...board,
        activeTaskId: item.id,
        deckMode: 'single',
        detail: { isOpen: true, mode: 'view', draftTitle: title, draftBody: body }
      };
      return { vm: { ...vm, content: { ...vm.content, taskBoard: nextBoard } } };
    }
    case 'TASK_DETAIL_OPEN': {
      const file = vm.content.file;
      if (!file || file.kind !== 'task') return { vm };
      const text = effectiveContentText(vm.content);
      const board = vm.content.taskBoard ?? parseTaskBoardV2(text, null);
      const item = board.items.find((t) => t.id === intent.taskId);
      if (!item) return { vm: { ...vm, content: { ...vm.content, taskBoard: board } } };
      const { title, body } = extractTaskDrafts(text, item);
      const nextBoard: TaskBoardVM = {
        ...board,
        activeTaskId: item.id,
        detail: { isOpen: true, mode: intent.mode, draftTitle: title, draftBody: body }
      };
      return { vm: { ...vm, content: { ...vm.content, taskBoard: nextBoard } } };
    }
    case 'TASK_DETAIL_CLOSE': {
      const file = vm.content.file;
      if (!file || file.kind !== 'task') return { vm };
      const board = vm.content.taskBoard;
      if (!board) return { vm };
      return { vm: { ...vm, content: { ...vm.content, taskBoard: { ...board, detail: EMPTY_TASK_DETAIL } } } };
    }
    case 'TASK_DECK_MODE_SET': {
      const file = vm.content.file;
      if (!file || file.kind !== 'task') return { vm };
      const text = effectiveContentText(vm.content);
      const board = vm.content.taskBoard ?? parseTaskBoardV2(text, null);
      const nextActive = board.activeTaskId ?? board.items[0]?.id ?? null;
      return {
        vm: {
          ...vm,
          content: {
            ...vm.content,
            taskBoard: { ...board, activeTaskId: nextActive, deckMode: intent.mode, detail: EMPTY_TASK_DETAIL }
          }
        }
      };
    }
    case 'TASK_DECK_PREV':
    case 'TASK_DECK_NEXT': {
      const file = vm.content.file;
      if (!file || file.kind !== 'task') return { vm };
      const text = effectiveContentText(vm.content);
      const board = vm.content.taskBoard ?? parseTaskBoardV2(text, null);
      const items = board.items;
      if (!items.length) return { vm: { ...vm, content: { ...vm.content, taskBoard: board } } };
      const idx = Math.max(0, items.findIndex((t) => t.id === board.activeTaskId));
      const delta = intent.type === 'TASK_DECK_NEXT' ? 1 : -1;
      const nextIdx = (idx + delta + items.length) % items.length;
      const nextId = items[nextIdx]?.id ?? items[0]!.id;
      const nextItem = items[nextIdx];

      if (nextItem && nextItem.linkedRefs.length > 0) {
        void (async () => {
          const linkedDocs = await loadLinkedDocs(file.path, nextItem.linkedRefs);
          ctx.set((state2) => {
            const currentBoard = state2.vm.content.taskBoard;
            if (!currentBoard || currentBoard.activeTaskId !== nextId) return { vm: state2.vm };
            return {
              vm: {
                ...state2.vm,
                content: {
                  ...state2.vm.content,
                  taskBoard: { ...currentBoard, linkedDocs, linkedDocsLoading: false, linkedDocsError: null }
                }
              }
            };
          });
        })();
      }

      return {
        vm: {
          ...vm,
          content: {
            ...vm.content,
            taskBoard: {
              ...board,
              activeTaskId: nextId,
              deckMode: 'single',
              detail: EMPTY_TASK_DETAIL,
              linkedDocs: [],
              linkedDocsLoading: nextItem?.linkedRefs.length ? true : false,
              linkedDocsError: null
            }
          }
        }
      };
    }
    case 'TASK_DECK_FOCUS': {
      const file = vm.content.file;
      if (!file || file.kind !== 'task') return { vm };
      const text = effectiveContentText(vm.content);
      const board = vm.content.taskBoard ?? parseTaskBoardV2(text, null);
      const targetItem = board.items.find((t) => t.id === intent.taskId);
      if (!targetItem) return { vm: { ...vm, content: { ...vm.content, taskBoard: board } } };

      if (targetItem.linkedRefs.length > 0) {
        void (async () => {
          const linkedDocs = await loadLinkedDocs(file.path, targetItem.linkedRefs);
          ctx.set((state2) => {
            const currentBoard = state2.vm.content.taskBoard;
            if (!currentBoard || currentBoard.activeTaskId !== intent.taskId) return { vm: state2.vm };
            return {
              vm: {
                ...state2.vm,
                content: {
                  ...state2.vm.content,
                  taskBoard: { ...currentBoard, linkedDocs, linkedDocsLoading: false, linkedDocsError: null }
                }
              }
            };
          });
        })();
      }

      return {
        vm: {
          ...vm,
          content: {
            ...vm.content,
            taskBoard: {
              ...board,
              activeTaskId: intent.taskId,
              deckMode: 'single',
              detail: EMPTY_TASK_DETAIL,
              linkedDocs: [],
              linkedDocsLoading: targetItem.linkedRefs.length > 0,
              linkedDocsError: null
            }
          }
        }
      };
    }
    case 'TASK_LINKED_DOC_JUMP': {
      const file = vm.content.file;
      if (!file) return { vm };
      const dirPath = file.path.replace(/[/\\][^/\\]+$/, '');
      const targetPath = `${dirPath}/${intent.sourceFile}`;

      void (async () => {
        queueMicrotask(() => ctx.dispatch({ type: 'EXPLORER_OPEN_FILE', path: targetPath }));

        // 等待 explorer 完成打开文件，再设置查找条件用于高亮定位。
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 25));
          const now = ctx.get().vm;
          if (now.content.file?.path !== targetPath) continue;

          const hits = findMatchStarts(now.content.text, intent.refId);
          ctx.set((state2) => {
            const vm2 = state2.vm;
            if (vm2.content.file?.path !== targetPath) return { vm: vm2 };
            return {
              vm: {
                ...vm2,
                centerVisible: true,
                content: {
                  ...vm2.content,
                  find: { isOpen: true, query: intent.refId, matchStarts: hits, activeIndex: 0 }
                }
              }
            };
          });
          return;
        }
      })();

      return { vm };
    }
    case 'TASK_LINKED_DOCS_TOGGLE_SECTION':
      return { vm };
    case 'TASK_DETAIL_MODE_SET': {
      const file = vm.content.file;
      if (!file || file.kind !== 'task') return { vm };
      const board = vm.content.taskBoard;
      if (!board?.activeTaskId) return { vm };
      const text = effectiveContentText(vm.content);
      const item = board.items.find((t) => t.id === board.activeTaskId);
      if (!item) return { vm };
      const { title, body } = extractTaskDrafts(text, item);
      return {
        vm: {
          ...vm,
          content: {
            ...vm.content,
            taskBoard: {
              ...board,
              detail: { isOpen: true, mode: intent.mode, draftTitle: title, draftBody: body }
            }
          }
        }
      };
    }
    case 'TASK_DETAIL_DRAFT_SET': {
      const file = vm.content.file;
      if (!file || file.kind !== 'task') return { vm };
      const board = vm.content.taskBoard;
      if (!board?.detail.isOpen) return { vm };
      const nextTitle = intent.title ?? board.detail.draftTitle;
      const nextBody = intent.body ?? board.detail.draftBody;
      return {
        vm: {
          ...vm,
          content: {
            ...vm.content,
            taskBoard: { ...board, detail: { ...board.detail, draftTitle: nextTitle, draftBody: nextBody } }
          }
        }
      };
    }
    case 'TASK_DETAIL_SAVE': {
      const file = vm.content.file;
      if (!file || file.kind !== 'task') return { vm };
      const board = vm.content.taskBoard;
      if (!board?.activeTaskId || !board.detail.isOpen) return { vm };

      const effectiveText = effectiveContentText(vm.content);
      const item = board.items.find((t) => t.id === board.activeTaskId);
      if (!item) return { vm };

      const blockText = effectiveText.slice(item.source.blockStartPos, item.source.blockEndPos);
      const trimmed = blockText.trimEnd();
      const tail = blockText.slice(trimmed.length);

      const statusChar = item.checked ? 'x' : ' ';
      const beforeStatus = effectiveText.slice(item.source.blockStartPos, item.source.statusPos);
      const afterStatus = effectiveText.slice(item.source.statusPos + 1, item.source.titleStartPos);
      const nextTitle = board.detail.draftTitle.trim();
      const headerLine = `${beforeStatus}${statusChar}${afterStatus}${nextTitle}`;

      const newline = detectNewline(effectiveText);
      const nextBody = normalizeNewlines(board.detail.draftBody, newline).trimEnd();

      let nextBlock = headerLine;
      if (nextBody) nextBlock += `${newline}${nextBody}`;
      nextBlock += tail;

      const nextText = effectiveText.slice(0, item.source.blockStartPos) + nextBlock + effectiveText.slice(item.source.blockEndPos);

      const optimisticPrev: TaskBoardVM = { ...board, detail: { ...board.detail, mode: 'view' } };
      const optimisticBoard = parseTaskBoardV2(nextText, optimisticPrev);

      void (async () => {
        const api = window.specwave;
        if (!api) return;
        const current = ctx.get().vm.content.file;
        if (!current || current.path !== file.path) return;
        const res = await api.saveTextFile(current.path, nextText, current.sha256);
        if (res.ok) selfWriteAtByPath.set(normalizeFsPath(current.path), Date.now());

        ctx.set((state2) => {
          const vm2 = state2.vm;
          if (!vm2.content.file || vm2.content.file.path !== file.path) return { vm: vm2 };

          if (!res.ok) {
            if ('conflict' in res && res.conflict) {
              return { vm: { ...vm2, content: { ...vm2.content, saveStatus: 'conflict', saveError: res.error } } };
            }
            return { vm: { ...vm2, content: { ...vm2.content, saveStatus: 'error', saveError: res.error } } };
          }

          return {
            vm: {
              ...vm2,
              content: {
                ...vm2.content,
                text: nextText,
                draftText: nextText,
                isDirty: false,
                saveStatus: 'saved',
                saveError: null,
                file: { ...vm2.content.file!, sha256: res.sha256 },
                taskBoard: parseTaskBoardV2(nextText, vm2.content.taskBoard)
              }
            }
          };
        });
      })();

      return {
        vm: {
          ...vm,
          content: {
            ...vm.content,
            draftText: nextText,
            isDirty: true,
            saveStatus: 'saving',
            saveError: null,
            taskBoard: optimisticBoard
          }
        }
      };
    }
    case 'TASK_ITEM_START': {
      const file = vm.content.file;
      if (!file || file.kind !== 'task') return { vm };
      const board = vm.content.taskBoard;
      if (!board) return { vm };
      const item = board.items.find((t) => t.id === intent.taskId);
      if (!item) return { vm };

      const effectiveText = effectiveContentText(vm.content);
      const rawBlock = effectiveText.slice(item.source.blockStartPos, item.source.blockEndPos).trimEnd();
      const lines = rawBlock.replaceAll('\r\n', '\n').split('\n');
      const template = [
        `# 开始：${item.title.trim()}`,
        `# 来源：${file.name}`,
        '# 任务内容：',
        ...lines.map((l) => `# ${l}`),
        '#'
      ].join('\r\n');

      const ensurePanel = () => {
        const active = vm.terminal.activePanelId;
        if (active && vm.terminal.panelIds.includes(active)) return active;
        const fallback = vm.terminal.panelIds[0];
        if (fallback) return fallback;
        return '';
      };

      const existingId = ensurePanel();
      if (existingId) {
        void (async () => {
          const api = window.specwave;
          if (!api?.terminalWrite) return;
          api.terminalWrite(existingId, template);
        })();

        return {
          vm: {
            ...vm,
            rightVisible: true,
            rightMode: 'terminal' as const,
            terminal: { ...vm.terminal, activePanelId: existingId }
          }
        };
      }

      const nextId = `terminal-${Date.now()}`;
      ctx.terminalUserTyped.delete(nextId);
      const cwd = vm.explorer.projectRoot ?? null;

      void (async () => {
        const api = window.specwave;
        if (!api?.terminalCreateSession) return;
        const res = await api.terminalCreateSession({ id: nextId, cwd });
        if (!res.ok) {
          ctx.set((state2) => {
            const vm2 = state2.vm;
            const prev = vm2.terminal.outputByPanel[nextId] ?? [];
            const next = [...prev, `\r\n[终端启动失败] ${res.error}\r\n`];
            return { vm: { ...vm2, terminal: { ...vm2.terminal, outputByPanel: { ...vm2.terminal.outputByPanel, [nextId]: next } } } };
          });
          return;
        }
        try {
          api.terminalWrite?.(nextId, template);
        } catch {}
      })();

      return {
        vm: {
          ...vm,
          rightVisible: true,
          rightMode: 'terminal' as const,
          terminal: {
            panelIds: [...vm.terminal.panelIds, nextId],
            activePanelId: nextId,
            outputByPanel: { ...vm.terminal.outputByPanel, [nextId]: ['正在启动终端…\r\n'] }
          }
        }
      };
    }
    default:
      return null;
  }
}
