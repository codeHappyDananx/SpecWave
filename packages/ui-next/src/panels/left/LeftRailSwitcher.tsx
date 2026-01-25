import React from 'react';
import type { LeftPanelTab, UIIntent } from '@specwave/contracts';
import { FolderTree, Wrench } from 'lucide-react';

import { Button } from '../../primitives/shadcn/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../../primitives/shadcn/hover-card';

type LeftRailIntent = Extract<UIIntent, { type: 'LEFT_PANEL_TAB_SET' }>;

export function LeftRailSwitcher(props: { tab: LeftPanelTab; dispatch: (intent: LeftRailIntent) => void }) {
  const itemClassName = (active: boolean) =>
    [
      'w-full h-9',
      'text-[12px]',
      'transition-[background-color,transform,color] duration-200',
      active ? 'bg-muted/60 text-foreground' : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
      'data-[active=true]:scale-[1.02]'
    ].join(' ');

  return (
    <div className="flex h-full w-[44px] flex-col items-center gap-2 border-r border-border bg-background px-1 py-2">
      <HoverCard openDelay={120} closeDelay={120}>
        <HoverCardTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className={itemClassName(props.tab === 'workbench')}
            data-active={props.tab === 'workbench' ? 'true' : 'false'}
            aria-label="工作区"
            onClick={() => props.dispatch({ type: 'LEFT_PANEL_TAB_SET', tab: 'workbench' })}
          >
            <FolderTree className="h-4 w-4" aria-hidden={true} />
          </Button>
        </HoverCardTrigger>
        <HoverCardContent side="right" className="w-64">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium">工作区</div>
            <div className="text-xs text-muted-foreground">浏览与打开文件，日常开发入口。</div>
          </div>
        </HoverCardContent>
      </HoverCard>

      <HoverCard openDelay={120} closeDelay={120}>
        <HoverCardTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className={itemClassName(props.tab === 'codexCapabilities')}
            data-active={props.tab === 'codexCapabilities' ? 'true' : 'false'}
            aria-label="能力（MCP 与技能）"
            onClick={() => props.dispatch({ type: 'LEFT_PANEL_TAB_SET', tab: 'codexCapabilities' })}
          >
            <Wrench className="h-4 w-4" aria-hidden={true} />
          </Button>
        </HoverCardTrigger>
        <HoverCardContent side="right" className="w-64">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium">能力</div>
            <div className="text-xs text-muted-foreground">探测并管理 MCP（模型上下文协议）与技能，支持安装与刷新。</div>
          </div>
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}
