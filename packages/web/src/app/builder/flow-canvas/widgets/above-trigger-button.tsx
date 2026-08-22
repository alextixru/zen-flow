import { t } from 'i18next';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { isMac } from '@/lib/dom-utils';
import { cn } from '@/lib/utils';

type AboveTriggerButtonProps = {
  onClick: () => void;
  text: string;
  disable?: boolean;
  loading?: boolean;
  showKeyboardShortcut?: boolean;
  shortCutIsEscape?: boolean;
  showPrimaryBg?: boolean;
};

const AboveTriggerButton = ({
  onClick,
  text,
  disable = false,
  loading = false,
  showKeyboardShortcut = true,
  shortCutIsEscape = false,
  showPrimaryBg = true,
}: AboveTriggerButtonProps) => {
  const isMacSystem = isMac();

  useEffect(() => {
    const keydownHandler = (event: KeyboardEvent) => {
      const isEscapePressed = event.key === 'Escape' && shortCutIsEscape;
      const ctrlAndDPressed =
        (isMacSystem &&
          event.metaKey &&
          event.key.toLocaleLowerCase() === 'd') ||
        (!isMacSystem &&
          event.ctrlKey &&
          event.key.toLocaleLowerCase() === 'd');
      if (isEscapePressed || ctrlAndDPressed) {
        event.preventDefault();
        event.stopPropagation();
        if (!loading && !disable) {
          onClick();
        }
      }
    };

    window.addEventListener('keydown', keydownHandler, { capture: true });

    return () => {
      window.removeEventListener('keydown', keydownHandler, { capture: true });
    };
  }, [isMac, loading, onClick]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Zen DS: главное действие канваса — ink-заливка; второстепенное — плашка с подчёркнутым текстом */}
        <div className="bg-builder-background">
          <Button
            variant={showPrimaryBg ? 'default' : 'secondary'}
            className={cn('h-8 animate-fade', {
              'disabled:pointer-events-auto': showPrimaryBg,
              'bg-background px-2.5 shadow-[0_1px_3px_rgb(0_0_0_/_0.06)]':
                !showPrimaryBg,
            })}
            loading={loading}
            disabled={disable}
            onClick={onClick}
          >
            <div className="flex justify-center items-center gap-2">
              {text}
              {showKeyboardShortcut && (
                <span
                  className={cn(
                    'text-[10px] h-[20px] flex items-center justify-center px-1 rounded-sm tracking-widest whitespace-nowrap',
                    showPrimaryBg
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {shortCutIsEscape
                    ? 'Esc'
                    : isMacSystem
                    ? '⌘ + D'
                    : 'Ctrl + D'}
                </span>
              )}
            </div>
          </Button>
        </div>
      </TooltipTrigger>
      {disable && (
        <TooltipContent side="bottom">
          {t('Please test the trigger first')}
        </TooltipContent>
      )}
    </Tooltip>
  );
};

AboveTriggerButton.displayName = 'AboveTriggerButton';

export { AboveTriggerButton };
