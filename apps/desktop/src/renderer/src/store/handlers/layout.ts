import type { UIIntent } from '@specwave/contracts';

import type { AppState, StoreCtx } from '../types';
import {
  applyDrag,
  clamp,
  MAX_LEFT_PX,
  MIN_CENTER_PX,
  MIN_LEFT_PX,
  MIN_RIGHT_PX,
  normalizeLayoutStable,
  SPLITTER_PX,
  splitterCountFlags,
  type DragSnapshot
} from '../shared/layout';

/**
 * Layout handler（布局拖拽与容器宽度）
 *
 * - 处理 intent：LAYOUT_CONTAINER_SET / LAYOUT_DRAG_START / LAYOUT_DRAG_MOVE / LAYOUT_DRAG_END
 * - 读写的 VM 字段：
 *   - layout（containerWidthPx / leftPx / centerPx / rightPx / isDragging）
 *   - panelMinW（仅更新 centerPx 的最小宽度参考值）
 *   - leftVisible / centerVisible / rightVisible（拖拽过程中可能触发隐藏/显示）
 * - 读写的 state 字段：drag（DragSnapshot）
 * - 副作用：无（纯状态更新）
 */
export function handleLayoutIntent(args: { ctx: StoreCtx; state: AppState; intent: UIIntent }): Partial<AppState> | null {
  const { state, intent } = args;
  const vm = state.vm;
  const drag = state.drag;

  switch (intent.type) {
    case 'LAYOUT_CONTAINER_SET': {
      // 响应式策略：窗口变窄时不挤压三栏宽度，改用底部横向滚动条承载。
      // 现在改为“各区域内部滚动条承载内容最小宽度”，因此这里：
      // - 缩小窗口：只更新容器宽度（避免抖动）
      // - 放大窗口：让 centerPx 同步到当前可用宽度基准，保证拖拽阈值不失真
      const prev = vm.layout.containerWidthPx;
      const nextPanelMinW = { ...vm.panelMinW, centerPx: Math.max(320, Math.round(intent.widthPx * 0.7)) };
      if (intent.widthPx <= prev) {
        return { vm: { ...vm, panelMinW: nextPanelMinW, layout: { ...vm.layout, containerWidthPx: intent.widthPx } } };
      }

      const splitters = splitterCountFlags(vm) * SPLITTER_PX;
      const available = Math.max(0, intent.widthPx - splitters);
      const left = vm.leftVisible ? clamp(vm.layout.leftPx, MIN_LEFT_PX, MAX_LEFT_PX) : 0;
      const right = vm.rightVisible ? Math.max(MIN_RIGHT_PX, vm.layout.rightPx) : 0;
      const remainder = Math.max(MIN_CENTER_PX, available - left - right);

      return {
        vm: {
          ...vm,
          panelMinW: nextPanelMinW,
          layout: { ...vm.layout, containerWidthPx: intent.widthPx, centerPx: remainder }
        }
      };
    }
    case 'LAYOUT_DRAG_START': {
      const snap: DragSnapshot = {
        handle: intent.handle,
        leftVisible: vm.leftVisible,
        centerVisible: vm.centerVisible,
        rightVisible: vm.rightVisible,
        leftPx: vm.layout.leftPx,
        centerPx: vm.layout.centerPx,
        rightPx: vm.layout.rightPx,
        containerWidthPx: vm.layout.containerWidthPx
      };
      return { vm: { ...vm, layout: { ...vm.layout, isDragging: true } }, drag: snap };
    }
    case 'LAYOUT_DRAG_MOVE': {
      if (!drag) return { vm };
      const next = applyDrag(drag, intent.deltaX);
      const nextVm = {
        ...vm,
        leftVisible: next.leftVisible,
        centerVisible: next.centerVisible,
        rightVisible: next.rightVisible,
        layout: { ...vm.layout, leftPx: next.leftPx, centerPx: next.centerPx, rightPx: next.rightPx }
      };
      return { vm: nextVm };
    }
    case 'LAYOUT_DRAG_END': {
      const normalized = normalizeLayoutStable(vm);
      return {
        vm: { ...vm, layout: { ...vm.layout, isDragging: false, ...normalized } },
        drag: null
      };
    }
    default:
      return null;
  }
}

