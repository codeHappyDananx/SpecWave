import type { AppViewModel } from '@specwave/contracts';

export const SPLITTER_PX = 8;
export const MIN_LEFT_PX = 240;
// 左区最大宽度不使用固定值：拖拽时需要按窗口宽度动态放开，否则最大化后无法继续挤压其它区域。
// 这里保留一个“展示默认”上限，主要用于非拖拽场景的 clamp（拖拽场景用动态上限）。
export const MAX_LEFT_PX = 720;
export const MIN_CENTER_PX = 320;
export const MIN_RIGHT_PX = 320;

export type DragSnapshot = {
  handle: 'L' | 'R';
  leftVisible: boolean;
  centerVisible: boolean;
  rightVisible: boolean;
  leftPx: number;
  centerPx: number;
  rightPx: number;
  containerWidthPx: number;
};

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function splitterCountFlags(flags: { leftVisible: boolean; centerVisible: boolean; rightVisible: boolean }) {
  const n = Number(flags.leftVisible) + Number(flags.centerVisible) + Number(flags.rightVisible);
  if (n <= 1) return 0;
  return n - 1;
}

export function normalizeLayoutStable(vm: AppViewModel) {
  let leftPx = vm.layout.leftPx;
  let centerPx = vm.layout.centerPx;
  let rightPx = vm.layout.rightPx;

  // 应用最小值约束
  if (vm.leftVisible) leftPx = clamp(leftPx, MIN_LEFT_PX, MAX_LEFT_PX);
  if (vm.centerVisible) centerPx = Math.max(MIN_CENTER_PX, centerPx);
  if (vm.rightVisible) rightPx = Math.max(MIN_RIGHT_PX, rightPx);

  // 计算可用空间，确保面板重新显示时能正确分配空间
  const splitters = splitterCountFlags(vm) * SPLITTER_PX;
  const available = Math.max(0, vm.layout.containerWidthPx - splitters);
  const visibleLeft = vm.leftVisible ? leftPx : 0;
  const visibleRight = vm.rightVisible ? rightPx : 0;
  const total = visibleLeft + centerPx + visibleRight;

  // 如果总宽度超出可用空间，从 centerPx 中扣除
  if (total > available && vm.centerVisible) {
    const overflow = total - available;
    centerPx = Math.max(MIN_CENTER_PX, centerPx - overflow);
  }

  return { leftPx, centerPx, rightPx };
}

export function applyDrag(snapshot: DragSnapshot, deltaX: number) {
  const vmFlags = { leftVisible: snapshot.leftVisible, centerVisible: snapshot.centerVisible, rightVisible: snapshot.rightVisible };
  const total = Math.max(0, snapshot.containerWidthPx - splitterCountFlags(vmFlags) * SPLITTER_PX);

  let leftVisible = snapshot.leftVisible;
  let centerVisible = snapshot.centerVisible;
  let rightVisible = snapshot.rightVisible;

  let leftPx = snapshot.leftPx;
  let centerPx = snapshot.centerPx;
  let rightPx = snapshot.rightPx;

  const hideLeft = () => {
    leftVisible = false;
    leftPx = 0;
  };
  const hideRight = () => {
    rightVisible = false;
    rightPx = 0;
  };

  if (snapshot.handle === 'L') {
    // 分界线右移：left 变宽；先压 center，再压 right，最后收起 right。
    // 分界线左移：left 变窄；先放 center（或 right），最小值触发收起 left。
    if (!leftVisible) {
      leftVisible = true;
      leftPx = MIN_LEFT_PX;
    }

    const desiredLeft = snapshot.leftPx + deltaX;
    if (desiredLeft < MIN_LEFT_PX) {
      hideLeft();
      const visibleFlags = { leftVisible, centerVisible, rightVisible };
      const totalAfter = Math.max(0, snapshot.containerWidthPx - splitterCountFlags(visibleFlags) * SPLITTER_PX);
      if (centerVisible && rightVisible) {
        rightPx = Math.max(MIN_RIGHT_PX, snapshot.rightPx);
        centerPx = Math.max(MIN_CENTER_PX, totalAfter - rightPx);
        return { leftVisible, centerVisible, rightVisible, leftPx, centerPx: totalAfter - rightPx, rightPx };
      }
      if (centerVisible) return { leftVisible, centerVisible, rightVisible, leftPx, centerPx: totalAfter, rightPx: 0 };
      if (rightVisible) return { leftVisible, centerVisible: false, rightVisible, leftPx, centerPx: 0, rightPx: totalAfter };
      return { leftVisible, centerVisible: false, rightVisible: false, leftPx: 0, centerPx: 0, rightPx: 0 };
    }

    // 拖拽时动态上限：允许把 left 拉得足够宽，才能继续压缩 center/right 直至隐藏。
    const splitters = splitterCountFlags({ leftVisible: true, centerVisible, rightVisible }) * SPLITTER_PX;
    const dynamicMax = Math.max(MIN_LEFT_PX, snapshot.containerWidthPx - splitters - (centerVisible ? MIN_CENTER_PX : 0));
    leftPx = clamp(desiredLeft, MIN_LEFT_PX, dynamicMax);
    const actualDelta = leftPx - snapshot.leftPx;

    if (centerVisible) {
      centerPx = snapshot.centerPx - actualDelta;
      rightPx = rightVisible ? snapshot.rightPx : 0;

      if (centerPx < MIN_CENTER_PX) {
        const deficit = MIN_CENTER_PX - centerPx;
        centerPx = MIN_CENTER_PX;
        if (rightVisible) rightPx = rightPx - deficit;
      }

      if (rightVisible && rightPx < MIN_RIGHT_PX) {
        hideRight();
      }

      const visibleFlags = { leftVisible, centerVisible, rightVisible };
      const totalAfter = Math.max(0, snapshot.containerWidthPx - splitterCountFlags(visibleFlags) * SPLITTER_PX);

      if (!rightVisible) {
        centerPx = Math.max(MIN_CENTER_PX, totalAfter - leftPx);
        // center 负责自适应；left 不能过大（已 clamp）
        return { leftVisible, centerVisible, rightVisible, leftPx, centerPx: totalAfter - leftPx, rightPx: 0 };
      }

      return { leftVisible, centerVisible, rightVisible, leftPx, centerPx, rightPx };
    }

    if (rightVisible) {
      rightPx = snapshot.rightPx - actualDelta;
      if (rightPx < MIN_RIGHT_PX) {
        hideRight();
      }
      const visibleFlags = { leftVisible, centerVisible: false, rightVisible };
      const totalAfter = Math.max(0, snapshot.containerWidthPx - splitterCountFlags(visibleFlags) * SPLITTER_PX);
      if (!rightVisible) {
        // 只有 left：右侧允许空白，left 不能过大
        leftPx = clamp(leftPx, MIN_LEFT_PX, MAX_LEFT_PX);
        return { leftVisible, centerVisible: false, rightVisible: false, leftPx, centerPx: 0, rightPx: 0 };
      }
      return { leftVisible, centerVisible: false, rightVisible, leftPx, centerPx: 0, rightPx: totalAfter - leftPx };
    }

    // 只有 left：允许空白
    leftPx = clamp(leftPx, MIN_LEFT_PX, MAX_LEFT_PX);
    return { leftVisible, centerVisible: false, rightVisible, leftPx, centerPx: 0, rightPx: 0 };
  }

  // handle === 'R'
  if (!rightVisible) {
    rightVisible = true;
    rightPx = MIN_RIGHT_PX;
  }

  // deltaX > 0：分界线右移 -> right 变窄；deltaX < 0：分界线左移 -> right 变宽
  const desiredRight = snapshot.rightPx - deltaX;
  if (desiredRight < MIN_RIGHT_PX) {
    hideRight();
    const visibleFlags = { leftVisible, centerVisible, rightVisible };
    const totalAfter = Math.max(0, snapshot.containerWidthPx - splitterCountFlags(visibleFlags) * SPLITTER_PX);
    if (centerVisible && leftVisible) {
      leftPx = clamp(snapshot.leftPx, MIN_LEFT_PX, MAX_LEFT_PX);
      centerPx = Math.max(MIN_CENTER_PX, totalAfter - leftPx);
      return { leftVisible, centerVisible, rightVisible, leftPx, centerPx: totalAfter - leftPx, rightPx: 0 };
    }
    if (centerVisible) return { leftVisible: false, centerVisible, rightVisible, leftPx: 0, centerPx: totalAfter, rightPx: 0 };
    if (leftVisible) return { leftVisible, centerVisible: false, rightVisible, leftPx: clamp(snapshot.leftPx, MIN_LEFT_PX, MAX_LEFT_PX), centerPx: 0, rightPx: 0 };
    return { leftVisible: false, centerVisible: false, rightVisible: false, leftPx: 0, centerPx: 0, rightPx: 0 };
  }

  rightPx = desiredRight;

  if (!centerVisible) {
    // center 关闭时不走 R 拖拽（界面也不会给这个拖拽点），这里兜底保持 right。
    return {
      leftVisible,
      centerVisible: false,
      rightVisible,
      leftPx: leftVisible ? clamp(snapshot.leftPx, MIN_LEFT_PX, MAX_LEFT_PX) : 0,
      centerPx: 0,
      rightPx
    };
  }

  // center 存在：先压 center，center 到最小后再压 left，left 到最小后收起 left。
  centerPx = snapshot.centerPx + deltaX;
  leftPx = leftVisible ? snapshot.leftPx : 0;

  if (centerPx < MIN_CENTER_PX) {
    const deficit = MIN_CENTER_PX - centerPx;
    centerPx = MIN_CENTER_PX;
    if (leftVisible) leftPx = leftPx - deficit;
  }

  if (leftVisible && leftPx < MIN_LEFT_PX) {
    hideLeft();
    const visibleFlags = { leftVisible, centerVisible, rightVisible };
    const totalAfter = Math.max(0, snapshot.containerWidthPx - splitterCountFlags(visibleFlags) * SPLITTER_PX);
    centerPx = Math.max(MIN_CENTER_PX, totalAfter - rightPx);
    return { leftVisible, centerVisible, rightVisible, leftPx: 0, centerPx: totalAfter - rightPx, rightPx };
  }

  return { leftVisible, centerVisible, rightVisible, leftPx, centerPx, rightPx };
}
