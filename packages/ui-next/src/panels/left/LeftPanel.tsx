import React from 'react';
import type { AppViewModel, UIIntent } from '@specwave/contracts';
import { Icon } from '../../primitives/Icons';
import { Panel } from '../../primitives/Panel';
import styles from './LeftPanel.module.css';

type LeftIntent = Extract<UIIntent, | { type: 'EXPLORER_TOGGLE_DIR' } | { type: 'EXPLORER_OPEN_FILE' }>;

export type LeftPanelProps = {
  explorer: AppViewModel['explorer'];
  dispatch: (intent: LeftIntent) => void;
  minwPx: number;
};

export function LeftPanel(props: LeftPanelProps) {
  const fileKindFromName = (name: string) => {
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
    if (ext === 'md') return 'markdown' as const;
    if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx') return 'code' as const;
    if (ext === 'json' || ext === 'yaml' || ext === 'yml' || ext === 'toml') return 'data' as const;
    if (ext === 'css' || ext === 'scss' || ext === 'less') return 'style' as const;
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'webp' || ext === 'svg') return 'image' as const;
    return 'text' as const;
  };

  const renderNode = (tree: 'workspace' | 'project', node: AppViewModel['explorer']['workspace'][number], depth: number) => {
    const isExpanded = props.explorer.expanded[tree].includes(node.id);
    const isSelected = props.explorer.selectedPath === node.id;
    const rowStyle = { paddingLeft: `${10 + depth * 18}px` };
    const kind = node.kind === 'dir' ? ('dir' as const) : fileKindFromName(node.name);

    if (node.kind === 'dir') {
      return (
        <li key={node.id} className={styles.node}>
          <button
            className={styles.nodeButton}
            type="button"
            style={rowStyle}
            aria-current={isSelected ? 'true' : 'false'}
            onClick={() => props.dispatch({ type: 'EXPLORER_TOGGLE_DIR', tree, id: node.id })}
          >
            <span className={styles.twist} aria-hidden="true">
              {isExpanded ? '▾' : '▸'}
            </span>
            <span className={styles.kindIcon} data-kind={kind} aria-hidden="true">
              <Icon name="folder" size={16} />
            </span>
            <span className={styles.name}>{node.name}</span>
            {node.isLoading ? <span className={styles.meta}>加载中…</span> : null}
          </button>
          {node.error ? <div className={styles.error}>{node.error}</div> : null}
          {isExpanded && node.children ? (
            <ul className={styles.tree} aria-label={`${node.name} 子节点`}>
              {node.children.map((c) => renderNode(tree, c, depth + 1))}
            </ul>
          ) : null}
        </li>
      );
    }

    return (
      <li key={node.id} className={styles.node}>
        <button
          className={styles.nodeButton}
          type="button"
          style={rowStyle}
          aria-current={isSelected ? 'true' : 'false'}
          onClick={() => props.dispatch({ type: 'EXPLORER_OPEN_FILE', path: node.id })}
        >
          <span className={styles.twist} aria-hidden="true" />
          <span className={styles.kindIcon} data-kind={kind} aria-hidden="true">
            <Icon name="file" size={16} />
          </span>
          <span className={styles.name}>{node.name}</span>
        </button>
      </li>
    );
  };

  return (
    <Panel
      as="aside"
      ariaLabel="左区"
      bodyAriaLabel="左区滚动区"
      minwPx={props.minwPx}
    >
      <div className={styles.content}>
        {!props.explorer.projectRoot ? (
          <div className={styles.empty} aria-label="未打开项目">
            还未打开项目。点击顶部“打开项目”后，这里会显示工作区与项目文件树。
          </div>
        ) : (
          <>
            <details className={styles.group} open>
              <summary className={styles.groupSummary}>SpecWave 工作区</summary>
              {props.explorer.workspaceRoot ? (
                <ul className={styles.tree} aria-label="工作区树">
                  {props.explorer.workspace.map((n) => renderNode('workspace', n, 0))}
                </ul>
              ) : (
                <div className={styles.muted}>未找到 .specwave/workspace（该目录不是 SpecWave 项目或未初始化）。</div>
              )}
            </details>

            <details className={styles.group} open>
              <summary className={styles.groupSummary}>项目文件</summary>
              <ul className={styles.tree} aria-label="项目文件树">
                {props.explorer.project.map((n) => renderNode('project', n, 0))}
              </ul>
            </details>

            {props.explorer.error ? <div className={styles.error}>{props.explorer.error}</div> : null}
          </>
        )}
      </div>
    </Panel>
  );
}
