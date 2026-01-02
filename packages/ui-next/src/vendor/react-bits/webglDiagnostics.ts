export function logWebglInitFailed(effectName: string, error: unknown) {
  console.error(
    `[SpecWave][Welcome][${effectName}] WebGL 初始化失败，背景动效无法渲染。可能原因：GPU 进程崩溃、Chromium 按域禁用 3D API、或显卡驱动兼容问题。`,
    error
  );
}

type WebglCtx = WebGLRenderingContext | WebGL2RenderingContext;

function isWebgl2(gl: WebglCtx) {
  // eslint-disable-next-line no-undef
  return typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
}

export function logWebglContextInfo(effectName: string, gl: WebglCtx) {
  try {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info') as
      | { UNMASKED_VENDOR_WEBGL: number; UNMASKED_RENDERER_WEBGL: number }
      | null;
    const vendor = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL))
      : String(gl.getParameter(gl.VENDOR) || '');
    const renderer = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER) || '');
    const version = String(gl.getParameter(gl.VERSION));
    const glsl = String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION));
    console.info(
      `[SpecWave][Welcome][${effectName}] WebGL 信息：webgl2=${isWebgl2(gl) ? '1' : '0'} vendor=${vendor || '-'} renderer=${renderer || '-'} version=${version} glsl=${glsl}`
    );
  } catch {
    // ignore
  }
}

export function createFirstFrameLogger(effectName: string, meta?: Record<string, string | number | boolean>) {
  const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let done = false;
  const metaText = meta ? ` ${Object.entries(meta).map(([k, v]) => `${k}=${String(v)}`).join(' ')}` : '';
  return () => {
    if (done) return;
    done = true;
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const cost = Math.max(0, Math.round(nowMs - startMs));
    console.info(`[SpecWave][Welcome][${effectName}] 首帧渲染完成：${cost}ms${metaText}`);
  };
}

export function createFpsSampleLogger(effectName: string, sampleMs = 1200) {
  const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let frames = 0;
  let done = false;
  return () => {
    if (done) return;
    frames += 1;
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsed = nowMs - startMs;
    if (elapsed < sampleMs) return;
    done = true;
    const fps = Math.max(0, Math.round((frames * 1000) / Math.max(1, elapsed)));
    console.info(`[SpecWave][Welcome][${effectName}] FPS 采样：${fps}（${Math.round(elapsed)}ms）`);
  };
}

export function attachWebglContextLoss(canvas: HTMLCanvasElement, effectName: string, onLost?: () => void) {
  const onContextLost = (e: Event) => {
    // 不调用 preventDefault 的话，浏览器可能不会触发后续恢复流程；我们至少要把“丢上下文”显式暴露出来。
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e as any).preventDefault?.();
    console.error(
      `[SpecWave][Welcome][${effectName}] WebGL 上下文丢失（CONTEXT_LOST_WEBGL）。如果动效开始卡顿/黑屏/白屏，请优先排查 GPU/ANGLE。`
    );
    try {
      // 给 WelcomePage 一个“无侵入”的信号：当任意背景丢上下文时，立即切到 CSS 动效，避免黑屏/低帧率拖垮体验。
      window.dispatchEvent(new CustomEvent('specwave-webgl-context-lost', { detail: { effectName } }));
    } catch {
      // ignore
    }
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
