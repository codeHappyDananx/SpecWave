import React from 'react';
import type { LeftPanelTab, UIIntent } from '@specwave/contracts';
import { FolderTree, Wrench } from 'lucide-react';

import { Button } from '../../primitives/shadcn/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../primitives/shadcn/tooltip';

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
      <Tooltip>
        <TooltipTrigger asChild>
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
        </TooltipTrigger>
        <TooltipContent>工作区</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
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
        </TooltipTrigger>
        <TooltipContent>能力（MCP 与技能）</TooltipContent>
      </Tooltip>
    </div>
  );
}

