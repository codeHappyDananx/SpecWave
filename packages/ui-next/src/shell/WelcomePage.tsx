import { useEffect, useMemo, useState } from 'react';
import type { RecentProjectVM, UIIntent } from '@specwave/contracts';
import { ColorBends } from '../vendor/react-bits/ColorBends';
import { FaultyTerminal } from '../vendor/react-bits/FaultyTerminal';
import { hyperspeedPresets } from '../vendor/react-bits/HyperSpeedPresets';
import { Hyperspeed } from '../vendor/react-bits/Hyperspeed';
import { Prism } from '../vendor/react-bits/Prism';
import { PrismaticBurst } from '../vendor/react-bits/PrismaticBurst';
import { Icon } from '../primitives/Icons';
import styles from './WelcomePage.module.css';

const WELCOME_BG_KEYS = ['faulty-terminal', 'prismatic-burst', 'hyperspeed', 'color-bends', 'prism'] as const;
type WelcomeBgKey = (typeof WELCOME_BG_KEYS)[number];

const PRISMATIC_COLORS = ['#8be9fd', '#a78bfa', '#22c55e', '#fbbf24', '#fb7185'];
const COLOR_BENDS_COLORS = ['#8be9fd', '#a78bfa', '#22c55e', '#fbbf24', '#60a5fa', '#fb7185'];

const HYPERSPEED_EFFECT = {
  ...hyperspeedPresets.two,
  colors: {
    ...hyperspeedPresets.two.colors,
    leftCars: [0xa78bfa, 0x7c3aed, 0xfb7185],
    rightCars: [0x8be9fd, 0x22d3ee, 0x60a5fa],
    sticks: 0x8be9fd,
    shoulderLines: 0x111827,
    brokenLines: 0x111827
  }
};

export type WelcomePageProps = {
  recentProjects: RecentProjectVM[];
  isLoading: boolean;
  error: string | null;
  dispatch: (intent: UIIntent) => void;
};

function canUseWebgl() {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

const WELCOME_DPR_MIN = 2;
const WELCOME_DPR_MAX = 3;

function clampDpr(value: number, min = 1, max = 2) {
  const v = Number.isFinite(value) && value > 0 ? value : 1;
  return Math.min(max, Math.max(min, v));
}

function computeWelcomeDpr() {
  if (typeof window === 'undefined') return WELCOME_DPR_MIN;
  const base = window.devicePixelRatio || 1;
  // 欢迎页背景以“更清晰”为优先：即使在 100% 缩放（DPR=1），也至少按 2 倍渲染。
  return clampDpr(base, WELCOME_DPR_MIN, WELCOME_DPR_MAX);
}

export function WelcomePage(props: WelcomePageProps) {
  const { recentProjects, isLoading, error, dispatch } = props;
  const [dismissWebglNotice, setDismissWebglNotice] = useState(false);
  const webglOk = useMemo(() => canUseWebgl(), []);
  const [dpr, setDpr] = useState(() => computeWelcomeDpr());

  useEffect(() => {
    const update = () => setDpr(computeWelcomeDpr());
    update();
    window.addEventListener('resize', update, { passive: true });
    window.visualViewport?.addEventListener('resize', update, { passive: true });
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);

  const bgKey: WelcomeBgKey = useMemo(() => {
    const idx = Math.floor(Math.random() * WELCOME_BG_KEYS.length);
    return WELCOME_BG_KEYS[idx] ?? 'faulty-terminal';
  }, []);

  return (
    <div className={styles.root} aria-label="欢迎页">
      <div className={styles.bg} aria-hidden="true">
        {webglOk && bgKey === 'faulty-terminal' ? (
          <FaultyTerminal
            className={styles.bgFx}
            mouseReact={true}
            mouseStrength={0.18}
            dpr={dpr}
            scale={1.05}
            gridMul={[3, 2]}
            digitSize={1.25}
            timeScale={0.25}
            scanlineIntensity={0.32}
            glitchAmount={1.04}
            noiseAmp={0.9}
            curvature={0.12}
            chromaticAberration={0.22}
            dither={1}
            tint="#8be9fd"
            brightness={0.92}
          />
        ) : null}

        {webglOk && bgKey === 'prismatic-burst' ? (
          <PrismaticBurst
            className={styles.bgFx}
            dpr={dpr}
            intensity={1.35}
            speed={0.45}
            animationType="hover"
            colors={PRISMATIC_COLORS}
            distort={0.55}
            paused={false}
            hoverDampness={0.22}
            rayCount={16}
            mixBlendMode="screen"
          />
        ) : null}

        {webglOk && bgKey === 'hyperspeed' ? (
          <Hyperspeed className={styles.bgFx} dpr={dpr} effectOptions={HYPERSPEED_EFFECT} />
        ) : null}

        {webglOk && bgKey === 'color-bends' ? (
          <ColorBends
            className={styles.bgFx}
            dpr={dpr}
            rotation={42}
            speed={0.22}
            colors={COLOR_BENDS_COLORS}
            transparent={true}
            autoRotate={0.08}
            scale={1}
            frequency={1}
            warpStrength={0.95}
            mouseInfluence={0.2}
            parallax={0.28}
            noise={0.05}
          />
        ) : null}

        {webglOk && bgKey === 'prism' ? (
          <Prism
            className={styles.bgFx}
            dpr={dpr}
            animationType="hover"
            transparent={true}
            noise={0.25}
            glow={0.8}
            bloom={0.9}
            scale={3.2}
            hueShift={200}
            colorFrequency={0.8}
            timeScale={0.45}
          />
        ) : null}

        <div className={styles.backdrop} />
        <div className={styles.vignette} />
      </div>

      <div className={styles.content}>
        <button
          type="button"
          className={styles.openButton}
          disabled={isLoading}
          onClick={() => dispatch({ type: 'PROJECT_SELECT' })}
        >
          {isLoading ? '正在打开…' : '打开项目'}
        </button>

        {!webglOk && !dismissWebglNotice ? (
          <button
            type="button"
            className={styles.webglBadge}
            aria-label="背景动效不可用（WebGL 不可用），点击关闭提示"
            title="当前环境无法创建 WebGL，欢迎页背景动效不可用。若遇到 GPU 崩溃，请优先切换 ANGLE 后重启。"
            onClick={() => setDismissWebglNotice(true)}
          >
            <Icon name="warning" size={18} />
          </button>
        ) : null}

        {error ? (
          <div className={styles.error} role="status" aria-live="polite">
            {error}
          </div>
        ) : null}

        {recentProjects.length > 0 ? (
          <section className={styles.recents} aria-label="历史项目">
            <div className={styles.list} role="list">
              {recentProjects.map((p) => (
                <div key={p.path} className={styles.item} role="listitem">
                  <button
                    type="button"
                    className={styles.itemOpen}
                    disabled={isLoading}
                    onClick={() => dispatch({ type: 'PROJECT_OPEN_RECENT', path: p.path })}
                  >
                    <div className={styles.itemNameRow}>
                      <div className={styles.itemName}>{p.name}</div>
                      {!p.exists ? (
                        <span className={styles.warning} title="路径不存在（可手动移除）" aria-label="路径不存在">
                          <Icon name="warning" size={18} />
                        </span>
                      ) : null}
                    </div>
                    <div className={styles.itemPath}>{p.path}</div>
                  </button>

                  <button
                    type="button"
                    className={styles.itemRemove}
                    aria-label={`从历史项目移除：${p.name}`}
                    onClick={() => dispatch({ type: 'RECENT_PROJECT_REMOVE', path: p.path })}
                  >
                    <Icon name="close" size={18} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
