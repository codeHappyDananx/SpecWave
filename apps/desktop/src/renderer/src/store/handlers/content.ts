import type { UIIntent } from '@specwave/contracts';

import type { AppState, StoreCtx } from '../types';
import { normalizeFsPath } from '../shared/path';
import { findMatchStarts } from '../shared/find';
import { parseTaskBoardV2 } from '../shared/taskBoard';
import { selfWriteAtByPath } from '../shared/selfWriteSilence';

/**
 * Content handler（编辑/保存/查找）
 *
 * - 处理 intent：
 *   - CONTENT_TOGGLE_VIEW_MODE / CONTENT_DRAFT_SET / CONTENT_SAVE_REQUEST
 *   - CONTENT_FIND_SET_QUERY / CONTENT_FIND_NEXT / CONTENT_FIND_PREV / CONTENT_FIND_CLOSE
 * - 读写的 VM 字段：content / centerVisible
 * - 副作用：preload saveTextFile；并写入 selfWriteAtByPath（用于外部变更静默窗口）
 */
export function handleContentIntent(args: { ctx: StoreCtx; state: AppState; intent: UIIntent }): Partial<AppState> | null {
  const { ctx, state, intent } = args;
  const vm = state.vm;

  const TOO_LARGE_FOR_EDITOR_CHARS = 300_000;

  switch (intent.type) {
    case 'CONTENT_TOGGLE_VIEW_MODE': {
      const file = vm.content.file;
      if (!file) return { vm };
      if (file.kind === 'image') return { vm };
      if (file.kind === 'binary') return { vm };
      const effectiveText = vm.content.isDirty ? vm.content.draftText : vm.content.text;

      const nextMode = (() => {
        if (file.kind === 'task') {
          if (vm.content.mode === 'task') return 'view' as const;
          if (vm.content.mode === 'view') return 'editor' as const;
          return 'task' as const;
        }
        if (vm.content.mode === 'view') return 'editor' as const;
        return 'view' as const;
      })();

      if (nextMode === 'editor' && effectiveText.length > TOO_LARGE_FOR_EDITOR_CHARS) {
        return { vm: { ...vm, content: { ...vm.content, mode: 'view' } } };
      }

      const nextTaskBoard =
        file.kind === 'task' && nextMode === 'task' ? parseTaskBoardV2(effectiveText, vm.content.taskBoard) : vm.content.taskBoard;
      return {
        vm: {
          ...vm,
          content: { ...vm.content, mode: nextMode, taskBoard: nextTaskBoard, draftText: effectiveText }
        }
      };
    }
    case 'CONTENT_DRAFT_SET': {
      const file = vm.content.file;
      if (!file) return { vm };
      const nextDraft = intent.text;
      const isDirty = nextDraft !== vm.content.text;
      const nextFind = (() => {
        if (!vm.content.find.isOpen) return vm.content.find;
        const hits = findMatchStarts(nextDraft, vm.content.find.query);
        const nextActive = hits.length ? Math.min(vm.content.find.activeIndex, hits.length - 1) : 0;
        return { ...vm.content.find, matchStarts: hits, activeIndex: nextActive };
      })();
      return {
        vm: {
          ...vm,
          content: { ...vm.content, draftText: nextDraft, isDirty, saveStatus: 'idle', saveError: null, find: nextFind }
        }
      };
    }
    case 'CONTENT_SAVE_REQUEST': {
      const file = vm.content.file;
      if (!file || !vm.content.isDirty) return { vm };

      void (async () => {
        const api = window.specwave;
        if (!api) return;
        const current = ctx.get().vm.content.file;
        if (!current || current.path !== file.path) return;
        const text = ctx.get().vm.content.draftText;
        const res = await api.saveTextFile(current.path, text, current.sha256);
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

          const kind = vm2.content.file.kind;
          const nextText = vm2.content.draftText;
          return {
            vm: {
              ...vm2,
              content: {
                ...vm2.content,
                text: nextText,
                isDirty: false,
                saveStatus: 'saved',
                saveError: null,
                file: { ...vm2.content.file, sha256: res.sha256 },
                taskBoard: kind === 'task' ? parseTaskBoardV2(nextText, vm2.content.taskBoard) : vm2.content.taskBoard
              }
            }
          };
        });
      })();

      return { vm: { ...vm, content: { ...vm.content, saveStatus: 'saving', saveError: null } } };
    }
    case 'CONTENT_FIND_SET_QUERY': {
      const file = vm.content.file;
      if (!file) return { vm };
      const text = vm.content.isDirty ? vm.content.draftText : vm.content.text;
      const hits = findMatchStarts(text, intent.query);
      return {
        vm: {
          ...vm,
          centerVisible: true,
          content: {
            ...vm.content,
            find: { isOpen: true, query: intent.query, matchStarts: hits, activeIndex: hits.length ? 0 : 0 }
          }
        }
      };
    }
    case 'CONTENT_FIND_NEXT': {
      const file = vm.content.file;
      if (!file) return { vm };
      const hits = vm.content.find.matchStarts;
      if (!hits.length) return { vm };
      const nextActive = (vm.content.find.activeIndex + 1) % hits.length;
      return { vm: { ...vm, content: { ...vm.content, find: { ...vm.content.find, isOpen: true, activeIndex: nextActive } } } };
    }
    case 'CONTENT_FIND_PREV': {
      const file = vm.content.file;
      if (!file) return { vm };
      const hits = vm.content.find.matchStarts;
      if (!hits.length) return { vm };
      const nextActive = (vm.content.find.activeIndex - 1 + hits.length) % hits.length;
      return { vm: { ...vm, content: { ...vm.content, find: { ...vm.content.find, isOpen: true, activeIndex: nextActive } } } };
    }
    case 'CONTENT_FIND_CLOSE': {
      if (!vm.content.file) return { vm };
      return { vm: { ...vm, content: { ...vm.content, find: { ...ctx.initialVm.content.find } } } };
    }
    default:
      return null;
  }
}
