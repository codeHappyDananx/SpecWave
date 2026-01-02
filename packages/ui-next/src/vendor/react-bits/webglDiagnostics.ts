export function logWebglInitFailed(effectName: string, error: unknown) {
  console.error(
    `[SpecWave][Welcome][${effectName}] WebGL 初始化失败，背景动效无法渲染。可能原因：GPU 进程崩溃、Chromium 按域禁用 3D API、或显卡驱动兼容问题。`,
    error
  );
}

export function attachWebglContextLoss(canvas: HTMLCanvasElement, effectName: string, onLost?: () => void) {
  const onContextLost = (e: Event) => {
    // 不调用 preventDefault 的话，浏览器可能不会触发后续恢复流程；我们至少要把“丢上下文”显式暴露出来。
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e as any).preventDefault?.();
    console.error(
      `[SpecWave][Welcome][${effectName}] WebGL 上下文丢失（CONTEXT_LOST_WEBGL）。如果动效开始卡顿/黑屏/白屏，请优先排查 GPU/ANGLE。`
    );
    onLost?.();
  };

  const onContextRestored = () => {
    console.info(`[SpecWave][Welcome][${effectName}] WebGL 上下文已恢复。`);
  };

  canvas.addEventListener('webglcontextlost', onContextLost, { passive: false });
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  return () => {
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
  };
}

