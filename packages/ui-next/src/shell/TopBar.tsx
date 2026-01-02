import React from 'react';
import type { AppViewModel, UIIntent } from '@specwave/contracts';
import { Icon } from '../primitives/Icons';
import { IconButton } from '../primitives/IconButton';
import { ProjectTab } from '../primitives/ProjectTab';
import styles from './TopBar.module.css';

type TopBarIntent = Extract<
  UIIntent,
  | { type: 'PROJECT_TAB_SET_ACTIVE' }
  | { type: 'PROJECT_TAB_CLOSE' }
  | { type: 'PROJECT_SELECT' }
  | { type: 'GLOBAL_SEARCH_SET' }
  | { type: 'PANEL_TOGGLE_LEFT' }
  | { type: 'PANEL_TOGGLE_CENTER' }
  | { type: 'PANEL_TOGGLE_RIGHT' }
  | { type: 'RIGHT_MODE_SET' }
  | { type: 'THEME_TOGGLE' }
>;

export type TopBarProps = {
  projects: AppViewModel['projects'];
  globalSearchQuery: string;
  leftVisible: boolean;
  centerVisible: boolean;
  rightVisible: boolean;
  rightMode: AppViewModel['rightMode'];
  dispatch: (intent: TopBarIntent) => void;
};

export function TopBar(props: TopBarProps) {
  return (
    <header className={styles.topBar} aria-label="TopBar">
      <div className={styles.left} aria-label="项目页签">
        {props.projects.openTabs.length > 0 ? (
          <div className={styles.projectTabs} role="tablist" aria-label="打开的项目">
            {props.projects.openTabs.map((t) => (
              <ProjectTab
                key={t.id}
                selected={t.id === props.projects.activeTabId}
                title={t.folderName}
                onSelect={() => props.dispatch({ type: 'PROJECT_TAB_SET_ACTIVE', id: t.id })}
                onClose={() => props.dispatch({ type: 'PROJECT_TAB_CLOSE', id: t.id })}
              />
            ))}
            <IconButton
              active
              title="打开项目"
              ariaLabel="打开项目"
              icon={<Icon name="plus" />}
              onClick={() => props.dispatch({ type: 'PROJECT_SELECT' })}
            />
          </div>
        ) : (
          <div className={styles.emptyTop} aria-label="未打开项目">
            <div className={styles.logo} aria-label="Logo">
              SW
            </div>
            <button
              className={styles.openProjectButton}
              type="button"
              onClick={() => props.dispatch({ type: 'PROJECT_SELECT' })}
            >
              打开项目
            </button>
          </div>
        )}
      </div>

      <div className={styles.center} aria-label="搜索">
        <input
          className={styles.searchInput}
          type="search"
          placeholder="搜索文件…"
          value={props.globalSearchQuery}
          onChange={(e) => props.dispatch({ type: 'GLOBAL_SEARCH_SET', query: e.target.value })}
        />
      </div>

      <div className={styles.right} aria-label="功能区">
        <div className={styles.iconBar} aria-label="快捷功能">
          <IconButton
            active={props.leftVisible}
            title="文件"
            icon={<Icon name="folder" />}
            onClick={() => props.dispatch({ type: 'PANEL_TOGGLE_LEFT' })}
          />
          <IconButton
            active={props.centerVisible}
            title="任务"
            icon={<Icon name="tasks" />}
            onClick={() => props.dispatch({ type: 'PANEL_TOGGLE_CENTER' })}
          />
          <IconButton
            active={props.rightVisible && props.rightMode === 'terminal'}
            title="终端"
            icon={<Icon name="terminal" />}
            onClick={() => {
              if (props.rightVisible && props.rightMode === 'terminal') {
                props.dispatch({ type: 'PANEL_TOGGLE_RIGHT' });
                return;
              }
              props.dispatch({ type: 'RIGHT_MODE_SET', mode: 'terminal' });
            }}
          />
          <IconButton
            active
            title="皮肤"
            icon={<Icon name="theme" />}
            onClick={() => props.dispatch({ type: 'THEME_TOGGLE' })}
          />
        </div>
      </div>
    </header>
  );
}
