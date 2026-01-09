import React from 'react';
import type { AppViewModel, UIIntent } from '@specwave/contracts';
import { Icon } from '../primitives/Icons';
import { ProjectTab } from '../primitives/ProjectTab';
import { Button } from '../primitives/shadcn/button';
import { Input } from '../primitives/shadcn/input';
import { Tooltip, TooltipTrigger, TooltipContent } from '../primitives/shadcn/tooltip';
import { Separator } from '../primitives/shadcn/separator';
import styles from './TopBar.module.css';

type TopBarIntent = Extract<
  UIIntent,
  | { type: 'PROJECT_TAB_SET_ACTIVE' }
  | { type: 'PROJECT_TAB_CLOSE' }
  | { type: 'PROJECT_TAB_ADD_EMPTY' }
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
  const activeTab = props.projects.activeTabId ? props.projects.openTabs.find((t) => t.id === props.projects.activeTabId) : null;
  const [searchValue, setSearchValue] = React.useState(props.globalSearchQuery);

  // 同步外部 globalSearchQuery 变化
  React.useEffect(() => {
    setSearchValue(props.globalSearchQuery);
  }, [props.globalSearchQuery]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.currentTarget.value;
    setSearchValue(text);
    props.dispatch({ type: 'GLOBAL_SEARCH_SET', query: text });
  };

  const handleSearchClear = () => {
    setSearchValue('');
    props.dispatch({ type: 'GLOBAL_SEARCH_SET', query: '' });
  };

  return (
    <header className={styles.topBar} aria-label="TopBar">
      <div className={styles.left} aria-label="项目页签">
        {props.projects.openTabs.length > 0 ? (
          <div className={styles.projectTabsWrap} aria-label="打开的项目">
            <div className={styles.projectTabsScroll} role="tablist" aria-label="打开的项目页签">
              {props.projects.openTabs.map((t) => (
                <ProjectTab
                  key={t.id}
                  selected={t.id === props.projects.activeTabId}
                  title={t.folderName}
                  onSelect={() => props.dispatch({ type: 'PROJECT_TAB_SET_ACTIVE', id: t.id })}
                  onClose={() => props.dispatch({ type: 'PROJECT_TAB_CLOSE', id: t.id })}
                />
              ))}
            </div>
            <div className={styles.projectActions} aria-label="项目操作">
              {activeTab?.path == null ? (
                <Button
                  variant="secondary"
                  className="text-[13px] font-bold h-9 px-3"
                  onClick={() => props.dispatch({ type: 'PROJECT_SELECT' })}
                >
                  打开项目
                </Button>
              ) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-[13px]"
                    aria-label="新建项目页签"
                    onClick={() => props.dispatch({ type: 'PROJECT_TAB_ADD_EMPTY' })}
                  >
                    <Icon name="plus" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>新建项目页签</TooltipContent>
              </Tooltip>
            </div>
          </div>
        ) : (
          <div className={styles.emptyTop} aria-label="未打开项目">
            <div className={styles.logo} aria-label="Logo">
              SW
            </div>
            <Button
              variant="secondary"
              className="text-[13px] font-bold h-9 px-3"
              onClick={() => props.dispatch({ type: 'PROJECT_SELECT' })}
            >
              打开项目
            </Button>
          </div>
        )}
      </div>

      <div className={styles.center} aria-label="搜索">
        <div className={styles.searchWrap}>
          <div className={styles.searchIcon} aria-hidden="true">
            <Icon name="search" size={18} />
          </div>
          <Input
            type="search"
            className="text-[13px] h-8 pl-9 pr-9 border-transparent bg-[var(--sw-muted)] focus-visible:bg-white focus-visible:border-[var(--sw-primary)]"
            aria-label="搜索文件"
            placeholder="搜索文件…"
            value={searchValue}
            onChange={handleSearchChange}
          />
          {searchValue ? (
            <button
              className={styles.searchClear}
              type="button"
              aria-label="清空"
              title="清空"
              onClick={handleSearchClear}
            >
              <Icon name="close" size={16} />
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.right} aria-label="功能区">
        <div className={styles.iconBar} aria-label="快捷功能">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-[13px]"
                data-active={props.leftVisible}
                aria-label="文件"
                onClick={() => props.dispatch({ type: 'PANEL_TOGGLE_LEFT' })}
              >
                <Icon name="folder" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>文件</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-[13px]"
                data-active={props.centerVisible}
                aria-label="任务"
                onClick={() => props.dispatch({ type: 'PANEL_TOGGLE_CENTER' })}
              >
                <Icon name="tasks" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>任务</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-[13px]"
                data-active={props.rightVisible && props.rightMode === 'terminal'}
                aria-label="终端"
                onClick={() => {
                  if (props.rightVisible && props.rightMode === 'terminal') {
                    props.dispatch({ type: 'PANEL_TOGGLE_RIGHT' });
                    return;
                  }
                  props.dispatch({ type: 'RIGHT_MODE_SET', mode: 'terminal' });
                }}
              >
                <Icon name="terminal" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>终端</TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="h-5 mx-1" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-[13px]"
                aria-label="皮肤"
                onClick={() => props.dispatch({ type: 'THEME_TOGGLE' })}
              >
                <Icon name="theme" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>皮肤</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
