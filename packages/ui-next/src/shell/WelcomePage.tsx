import { useMemo, useState } from 'react';
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

export function WelcomePage(props: WelcomePageProps) {
  const { recentProjects, isLoading, error, dispatch } = props;
  const [dismissWebglNotice, setDismissWebglNotice] = useState(false);
  const webglOk = useMemo(() => canUseWebgl(), []);

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
            mouseReact={false}
            dpr={1}
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
            dpr={1}
            intensity={1.35}
            speed={0.45}
            animationType="rotate3d"
            colors={PRISMATIC_COLORS}
            distort={0.55}
            paused={false}
            hoverDampness={0}
            rayCount={16}
            mixBlendMode="screen"
          />
        ) : null}

        {webglOk && bgKey === 'hyperspeed' ? (
          <Hyperspeed className={styles.bgFx} dpr={1} effectOptions={HYPERSPEED_EFFECT} />
        ) : null}

        {webglOk && bgKey === 'color-bends' ? (
          <ColorBends
            className={styles.bgFx}
            dpr={1}
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
            dpr={1}
            animationType="rotate"
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
        <section className={styles.hero} aria-label="开始">
          <div className={styles.brandRow}>
            <div className={styles.logo} aria-hidden="true" />
            <div className={styles.brandText}>SpecWave</div>
          </div>

          <h1 className={styles.title}>打开项目，开始梳理与解耦。</h1>
          <p className={styles.subtitle}>欢迎页只负责“起步”：打开项目、管理最近项目，不引入三栏任何逻辑。</p>

          {!webglOk && !dismissWebglNotice ? (
            <div className={styles.webglNotice} role="status" aria-live="polite">
              <span className={styles.webglNoticeIcon} aria-hidden="true">
                <Icon name="warning" size={18} />
              </span>
              <div className={styles.webglNoticeText}>
                当前环境无法创建 WebGL，欢迎页背景动效不可用。若你看到 “GPU process exited unexpectedly”，请优先切换 ANGLE（例如{' '}
                <code className={styles.inlineCode}>SPECWAVE_ANGLE=d3d9</code>）后重启。
              </div>
              <button
                type="button"
                className={styles.webglNoticeClose}
                aria-label="关闭提示"
                onClick={() => setDismissWebglNotice(true)}
              >
                <Icon name="close" size={18} />
              </button>
            </div>
          ) : null}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={isLoading}
              onClick={() => dispatch({ type: 'PROJECT_SELECT' })}
            >
              {isLoading ? '正在打开…' : '打开项目'}
            </button>
          </div>

          {error ? (
            <div className={styles.error} role="status" aria-live="polite">
              {error}
            </div>
          ) : null}
        </section>

        <section className={styles.recents} aria-label="最近项目">
          <div className={styles.recentsHeader}>
            <h2 className={styles.recentsTitle}>最近项目</h2>
            <div className={styles.recentsHint}>默认保存 10 条；路径不存在不会自动删除。</div>
          </div>

          {recentProjects.length === 0 ? (
            <div className={styles.empty}>暂无记录。你可以点击“打开项目”开始。</div>
          ) : (
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
                    aria-label={`从最近项目移除：${p.name}`}
                    onClick={() => dispatch({ type: 'RECENT_PROJECT_REMOVE', path: p.path })}
                  >
                    <Icon name="close" size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
