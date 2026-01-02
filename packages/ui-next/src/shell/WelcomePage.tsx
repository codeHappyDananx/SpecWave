import type { RecentProjectVM, UIIntent } from '@specwave/contracts';
import { FaultyTerminal } from '../vendor/react-bits/FaultyTerminal';
import { Icon } from '../primitives/Icons';
import styles from './WelcomePage.module.css';

export type WelcomePageProps = {
  recentProjects: RecentProjectVM[];
  isLoading: boolean;
  error: string | null;
  dispatch: (intent: UIIntent) => void;
};

export function WelcomePage(props: WelcomePageProps) {
  const { recentProjects, isLoading, error, dispatch } = props;

  return (
    <div className={styles.root} aria-label="欢迎页">
      <div className={styles.bg} aria-hidden="true">
        <FaultyTerminal
          className={styles.bgFx}
          mouseReact={false}
          dpr={1}
          scale={1.05}
          gridMul={[3, 2]}
          digitSize={1.25}
          timeScale={0.25}
          scanlineIntensity={0.45}
          glitchAmount={1.06}
          noiseAmp={0.95}
          curvature={0.12}
          chromaticAberration={0.9}
          dither={1}
          tint="#8be9fd"
          brightness={0.95}
        />
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
