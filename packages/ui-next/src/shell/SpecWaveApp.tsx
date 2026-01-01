import React from 'react';
import type { AppViewModel, UIIntent } from '@specwave/contracts';
import { Icon } from '../primitives/Icons';
import { PromptInput } from '../primitives/PromptInput';

export type SpecWaveAppProps = {
  vm: AppViewModel;
  dispatch: (intent: UIIntent) => void;
};

type TabProps = {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

function Tab(props: TabProps) {
  return (
    <button className="tab" type="button" role="tab" aria-selected={props.selected} onClick={props.onClick}>
      {props.children}
    </button>
  );
}

type ClosableTabProps = {
  selected: boolean;
  title: string;
  onSelect: () => void;
  onClose: () => void;
};

function ClosableTab(props: ClosableTabProps) {
  return (
    <div
      className="closableTab"
      role="tab"
      tabIndex={0}
      aria-selected={props.selected}
      onClick={props.onSelect}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        props.onSelect();
      }}
      title={props.title}
    >
      <span className="closableTabText">{props.title}</span>
      <button
        className="closableTabClose"
        type="button"
        aria-label={`关闭 ${props.title}`}
        title="关闭"
        onClick={(e) => {
          e.stopPropagation();
          props.onClose();
        }}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

type IconButtonProps = {
  active?: boolean;
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
};

function IconButton(props: IconButtonProps) {
  return (
    <button
      className="iconBtn"
      type="button"
      data-active={props.active ? 'true' : 'false'}
      aria-label={props.title}
      title={props.title}
      onClick={props.onClick}
    >
      {props.icon}
    </button>
  );
}

type ProjectTabProps = {
  selected: boolean;
  title: string;
  onSelect: () => void;
  onClose: () => void;
};

function ProjectTab(props: ProjectTabProps) {
  return (
    <div
      className="projTab"
      role="tab"
      tabIndex={0}
      aria-selected={props.selected}
      onClick={props.onSelect}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        props.onSelect();
      }}
    >
      <span className="projTabText">{props.title}</span>
      <button
        className="projTabClose"
        type="button"
        aria-label={`关闭项目 ${props.title}`}
        title="关闭"
        onClick={(e) => {
          e.stopPropagation();
          props.onClose();
        }}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
export function SpecWaveApp(props: SpecWaveAppProps) {
  const { vm, dispatch } = props;

  const showLeft = vm.leftVisible;
  const showCenter = vm.centerVisible;
  const showRight = vm.rightVisible;

  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{ startX: number; handle: 'L' | 'R' } | null>(null);

  React.useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (!w) return;
      dispatch({ type: 'LAYOUT_CONTAINER_SET', widthPx: w });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [dispatch]);

  const onSplitterPointerDown = (handle: 'L' | 'R') => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, handle };
    dispatch({ type: 'LAYOUT_DRAG_START', handle });

    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      dispatch({ type: 'LAYOUT_DRAG_MOVE', deltaX: ev.clientX - dragRef.current.startX });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      dispatch({ type: 'LAYOUT_DRAG_END' });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const splitLActive = showLeft && (showCenter || showRight || (!showCenter && !showRight));
  const splitRActive = showCenter && showRight;

  const panelMinW = {
    left: 240,
    // 中区内容宽度：按窗口宽度的 70% 计算；小于此宽度则中区内部横向滚动查看（内容不被挤压）。
    center: Math.max(320, Math.round(vm.layout.containerWidthPx * 0.7)),
    right: 320
  };

  const gridTemplateColumns = (() => {
    // 这里的宽度是“期望宽度”，CSS Grid 允许在小窗下缩到更小；
    // 内容最小宽度由各区域自己的横向滚动条承载。
    const leftCol = showLeft ? `minmax(0px, ${vm.layout.leftPx}px)` : '0px';
    const splitLCol = splitLActive ? '8px' : '0px';
    // 中区吃满剩余空间，但不设置硬最小列宽；“不挤压内容”的约束由中区自己的横向滚动条承载。
    const centerCol = showCenter ? `minmax(0px, 1fr)` : showRight ? '0px' : '1fr';
    const splitRCol = splitRActive ? '8px' : '0px';
    // 只有右区时，让右区也能吃满，避免出现空白。
    const rightCol = showRight ? (showCenter ? `minmax(0px, ${vm.layout.rightPx}px)` : `minmax(${vm.layout.rightPx}px, 1fr)`) : '0px';
    return [leftCol, splitLCol, centerCol, splitRCol, rightCol].join(' ');
  })();

  return (
    <div className="swRoot">
      <div className="app" aria-label="工作区">
        <header className="topBar" aria-label="TopBar">
          <div className="topBarLeft" aria-label="项目页签">
            {vm.projects.openTabs.length > 0 ? (
              <div className="projectTabs" role="tablist" aria-label="打开的项目">
                {vm.projects.openTabs.map((t) => (
                  <ProjectTab
                    key={t.id}
                    selected={t.id === vm.projects.activeTabId}
                    title={t.folderName}
                    onSelect={() => dispatch({ type: 'PROJECT_TAB_SET_ACTIVE', id: t.id })}
                    onClose={() => dispatch({ type: 'PROJECT_TAB_CLOSE', id: t.id })}
                  />
                ))}
              </div>
            ) : (
              <div className="emptyTop" aria-label="未打开项目">
                <div className="logo" aria-label="Logo">
                  SW
                </div>
                <button className="btn" type="button" onClick={() => dispatch({ type: 'PROJECT_OPEN_MOCK' })}>
                  打开项目
                </button>
              </div>
            )}
          </div>

          <div className="topBarCenter" aria-label="搜索">
            <input
              className="input search"
              type="search"
              placeholder="搜索文件…"
              value={vm.globalSearchQuery}
              onChange={(e) => dispatch({ type: 'GLOBAL_SEARCH_SET', query: e.target.value })}
            />
          </div>

          <div className="topBarRight" aria-label="功能区">
            <div className="iconBar" aria-label="快捷功能">
              <IconButton
                active={vm.leftVisible}
                title="文件"
                icon={<Icon name="folder" />}
                onClick={() => dispatch({ type: 'PANEL_TOGGLE_LEFT' })}
              />
              <IconButton
                active={vm.centerVisible}
                title="任务"
                icon={<Icon name="tasks" />}
                onClick={() => {
                  if (vm.centerVisible) {
                    dispatch({ type: 'PANEL_TOGGLE_CENTER' });
                    return;
                  }
                  dispatch({ type: 'CENTER_MODE_SET', mode: 'tasks' });
                }}
              />
              <IconButton
                active={vm.rightVisible && vm.rightMode === 'terminal'}
                title="终端"
                icon={<Icon name="terminal" />}
                onClick={() => {
                  if (vm.rightVisible && vm.rightMode === 'terminal') {
                    dispatch({ type: 'PANEL_TOGGLE_RIGHT' });
                    return;
                  }
                  dispatch({ type: 'RIGHT_MODE_SET', mode: 'terminal' });
                }}
              />
              <IconButton
                active
                title="皮肤"
                icon={<Icon name="theme" />}
                onClick={() => dispatch({ type: 'THEME_TOGGLE' })}
              />
            </div>
          </div>
        </header>
        <div
          ref={bodyRef}
          className={vm.layout.isDragging ? 'appBody isDragging' : 'appBody'}
          aria-label="工作区主体"
          style={{ gridTemplateColumns }}
        >
          <div className="pane" data-hidden={showLeft ? 'false' : 'true'} aria-hidden={!showLeft}>
            <LeftPanel minwPx={panelMinW.left} />
          </div>
          <div
            className={splitLActive ? 'splitter' : 'splitter isInactive'}
            role="separator"
            aria-label="调整左/中宽度"
            aria-hidden={!splitLActive}
            onPointerDown={splitLActive ? onSplitterPointerDown('L') : undefined}
          />
          <div className="pane" data-hidden={showCenter ? 'false' : 'true'} aria-hidden={!showCenter}>
            <CenterPanel vm={vm} dispatch={dispatch} minwPx={panelMinW.center} />
          </div>
          <div
            className={splitRActive ? 'splitter' : 'splitter isInactive'}
            role="separator"
            aria-label="调整中/右宽度"
            aria-hidden={!splitRActive}
            onPointerDown={splitRActive ? onSplitterPointerDown('R') : undefined}
          />
          <div className="pane" data-hidden={showRight ? 'false' : 'true'} aria-hidden={!showRight}>
            <RightPanel vm={vm} dispatch={dispatch} minwPx={panelMinW.right} />
          </div>
        </div>

        <footer className="statusBar" aria-label="StatusBar">
          <div className="statusLeft">
            <span className="statusPath">F:AI:SpecWave</span>
            <span className="badge">索引：进行中</span>
          </div>
          <div className="statusRight">
            <span className="badge badge--primary">Light</span>
            <span className="badge">FPS: 60</span>
            <span className="badge">IPC: mock</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

function LeftPanel(props: { minwPx: number }) {
  return (
    <aside className="panel panel--left" aria-label="左区">
      <div className="panelHeader" aria-label="左区头部">
        <div className="panelHeaderIcon" aria-label="文件">
          <Icon name="folder" />
        </div>
      </div>

      <div className="panelBodyScroll" aria-label="左区滚动区">
        <div className="panelBodyInner" style={{ ['--sw-panel-minw' as any]: `${props.minwPx}px` }}>
          <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
            <details className="treeGroup" open>
              <summary style={{ listStyle: 'none', cursor: 'pointer', fontWeight: 800, letterSpacing: '-.02em' }}>
                SpecWave 工作区
              </summary>
              <ul className="tree" aria-label="工作区树">
                <li>
                  <button type="button" aria-current="true">
                    <span className="mark" />
                    <span>stories</span>
                    <span className="meta">12</span>
                  </button>
                </li>
                <li>
                  <button type="button">
                    <span className="mark" />
                    <span>bugs</span>
                    <span className="meta">3</span>
                  </button>
                </li>
                <li>
                  <button type="button">
                    <span className="mark" />
                    <span>workspace</span>
                    <span className="meta">—</span>
                  </button>
                </li>
              </ul>
            </details>

            <details className="treeGroup" open>
              <summary style={{ listStyle: 'none', cursor: 'pointer', fontWeight: 800, letterSpacing: '-.02em' }}>
                项目文件
              </summary>
              <ul className="tree" aria-label="项目文件树">
                <li>
                  <button type="button">
                    <span className="mark" />
                    <span>src</span>
                    <span className="meta">…</span>
                  </button>
                </li>
                <li>
                  <button type="button">
                    <span className="mark" />
                    <span>packages</span>
                    <span className="meta">…</span>
                  </button>
                </li>
                <li>
                  <button type="button">
                    <span className="mark" />
                    <span>README.md</span>
                    <span className="meta">md</span>
                  </button>
                </li>
              </ul>
            </details>
          </div>
        </div>
      </div>
    </aside>
  );
}
function CenterPanel(props: { vm: AppViewModel; dispatch: (intent: UIIntent) => void; minwPx: number }) {
  const { vm, dispatch } = props;
  return (
    <section className="panel panel--center" aria-label="中区">
      <div className="panelHeader">
        <div className="panelHeaderIcon" aria-label="任务">
          <Icon name="tasks" />
        </div>
      </div>

      <div className="panelBodyScroll" aria-label="中区滚动区">
        <div className="panelBodyInner" style={{ ['--sw-panel-minw' as any]: `${props.minwPx}px` }}>
          <div style={{ display: 'grid', gap: 12, minHeight: 0 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="badge mono">STORY-000023</span>
                <span className="badge mono">intent.md</span>
                <span className="badge badge--accent">Source/Preview</span>
              </div>
              <div className="tabs" role="tablist" aria-label="视图切换">
                <Tab selected={vm.ui.centerMode === 'work'} onClick={() => dispatch({ type: 'CENTER_MODE_SET', mode: 'work' })}>
                  分屏
                </Tab>
                <Tab selected={vm.ui.centerMode === 'tasks'} onClick={() => dispatch({ type: 'CENTER_MODE_SET', mode: 'tasks' })}>
                  任务看板
                </Tab>
              </div>
            </div>

            {vm.ui.centerMode === 'tasks' ? (
              <div className="preview" aria-label="任务看板（示意）">
                <h4 style={{ margin: '0 0 10px', fontWeight: 800, letterSpacing: '-.02em' }}>任务看板</h4>
                <p className="muted" style={{ margin: 0, lineHeight: 1.7 }}>
                  这里先放占位：后续会接真实任务数据与状态流转。
                </p>
              </div>
            ) : (
              <div className="split" aria-label="编辑器与预览">
                <div className="editor" aria-label="编辑器">
                  <div style={{ opacity: 0.7 }}># intent.md（片段示意）</div>
                  <div style={{ marginTop: 10 }}>
                    {'## 目标\n- 交互结果一致\n- UI 可彻底重构\n\n## 关键约束\n- UI 只发 UIIntent\n- UI 只读 ViewModel'}
                  </div>
                </div>
                <div className="preview" aria-label="渲染预览">
                  <h4 style={{ margin: '0 0 10px', fontWeight: 800, letterSpacing: '-.02em' }}>
                    STORY-000023 源码梳理与解耦架构规划
                  </h4>
                  <p style={{ margin: '0 0 10px', lineHeight: 1.7 }}>
                    这是“复刻级规格包”：你可以彻底重做 UI，但交互语义必须一致。
                  </p>
                  <p className="muted" style={{ margin: '0 0 10px', lineHeight: 1.7 }}>
                    这里故意不靠阴影：层级只来自字号/字重/色块/留白。
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    <span className="badge">UIIntent</span>
                    <span className="badge badge--primary">Flat</span>
                    <span className="badge badge--secondary">可扩展</span>
                    <span className="badge badge--accent">Light</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
function RightPanel(props: { vm: AppViewModel; dispatch: (intent: UIIntent) => void; minwPx: number }) {
  const { vm, dispatch } = props;

  const headerTabs =
    vm.rightMode === 'terminal' ? (
      <div className="rightHeaderTabs" role="tablist" aria-label="终端页签">
        {vm.terminal.panelIds.map((id, idx) => (
          <ClosableTab
            key={id}
            selected={id === vm.terminal.activePanelId}
            title={`PS${idx + 1}`}
            onSelect={() => dispatch({ type: 'TERMINAL_PANEL_SET_ACTIVE', id })}
            onClose={() => dispatch({ type: 'TERMINAL_PANEL_CLOSE', id })}
          />
        ))}
      </div>
    ) : (
      <div className="rightHeaderTabs" role="tablist" aria-label="对话会话">
        {vm.chat.sessionIds.map((id, idx) => (
          <ClosableTab
            key={id}
            selected={id === vm.chat.activeSessionId}
            title={`AI${idx + 1}`}
            onSelect={() => dispatch({ type: 'CHAT_SESSION_SET_ACTIVE', id })}
            onClose={() => dispatch({ type: 'CHAT_SESSION_CLOSE', id })}
          />
        ))}
      </div>
    );

  return (
    <aside className="panel panel--right" aria-label="右区">
      <div className="panelHeader" aria-label="右区头部">
        <div className="rightHeaderLeft" aria-label="右区切换区">
          <div className="modeTabs" role="tablist" aria-label="终端/对话切换">
            <button
              className="modeTab"
              type="button"
              role="tab"
              aria-selected={vm.rightMode === 'terminal'}
              onClick={() => dispatch({ type: 'RIGHT_MODE_SET', mode: 'terminal' })}
              title="终端"
            >
              <Icon name="terminal" />
            </button>
            <button
              className="modeTab"
              type="button"
              role="tab"
              aria-selected={vm.rightMode === 'chat'}
              onClick={() => dispatch({ type: 'RIGHT_MODE_SET', mode: 'chat' })}
              title="对话"
            >
              <Icon name="chat" />
            </button>
          </div>
        </div>
        <div className="rightHeaderMid" aria-label="右区页签区">
          {headerTabs}
        </div>
        <button
          className="iconBtn rightHeaderAdd"
          type="button"
          aria-label="新增面板"
          title="新增"
          data-active="true"
          onClick={() => dispatch({ type: 'RIGHT_PANEL_ADD' })}
        >
          <Icon name="plus" />
        </button>
      </div>

      <div className="panelBodyScroll" aria-label="右区滚动区">
        <div className="panelBodyInner" style={{ ['--sw-panel-minw' as any]: `${props.minwPx}px` }}>
          {vm.rightMode === 'terminal' ? <TerminalView vm={vm} dispatch={dispatch} /> : <ChatView vm={vm} dispatch={dispatch} />}
        </div>
      </div>
    </aside>
  );
}

function TerminalView(props: { vm: AppViewModel; dispatch: (intent: UIIntent) => void }) {
  const { vm, dispatch } = props;
  const activeId = vm.terminal.activePanelId;
  const lines = vm.terminal.outputByPanel[activeId] ?? [];

  if (vm.terminal.panelIds.length === 0) {
    return (
      <div className="rightView" aria-label="终端空态">
        <div className="emptyHint" aria-label="终端提示">
          <div>还没有终端面板</div>
          <div className="muted">点击右上角 “+” 新建一个终端</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rightView" aria-label="终端面板">
      <div className="termBox" aria-label="终端输出">
        {lines.map((line, idx) => (
          <div key={idx}>{line}</div>
        ))}
      </div>

      <PromptInput
        ariaLabel="终端输入"
        placeholder="输入命令…"
        onSubmit={(command) => dispatch({ type: 'TERMINAL_COMMAND_SUBMIT', command })}
      />
    </div>
  );
}
function ChatView(props: { vm: AppViewModel; dispatch: (intent: UIIntent) => void }) {
  const { vm, dispatch } = props;
  const activeId = vm.chat.activeSessionId;
  const draft = vm.chat.draftBySession[activeId] ?? '';
  const msgs = vm.chat.messagesBySession[activeId] ?? [];

  return (
    <div className="rightView" aria-label="对话面板">
      <div className="chatMsgs" aria-label="对话消息">
        {msgs.map((m, idx) => (
          <div key={idx} className={m.who === '你' ? 'msg msg--user' : 'msg msg--ai'}>
            <div className="who">{m.who}</div>
            <div>{m.text}</div>
          </div>
        ))}
      </div>

      <PromptInput
        ariaLabel="对话输入"
        placeholder="输入指令…"
        value={draft}
        onChangeText={(text) => dispatch({ type: 'CHAT_DRAFT_SET', id: activeId, text })}
        onSubmit={(text) => dispatch({ type: 'CHAT_MESSAGE_SUBMIT', id: activeId, text })}
      />
    </div>
  );
}
