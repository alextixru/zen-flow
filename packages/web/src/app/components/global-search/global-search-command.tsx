import { t } from 'i18next';
import { Search } from 'lucide-react';

import { useEmbedding } from '@/components/providers/embed-provider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useGlobalSearch } from './global-search-context';

export function GlobalSearchCommand() {
  const { setOpen } = useGlobalSearch();
  const { embedState } = useEmbedding();
  const isMac =
    typeof navigator !== 'undefined' && /(Mac)/i.test(navigator.userAgent);

  if (embedState.hideGlobalSearch) {
    return null;
  }

  return (
    <Button
      variant="transparent"
      onClick={() => setOpen(true)}
      className={cn(
        // Zen DS: триггер поиска ведёт себя как input — без hover, линия загорается на фокусе
        'h-8 w-full justify-start gap-2 overflow-hidden rounded-none p-1! font-sans text-sm font-normal normal-case tracking-normal mr-auto',
        'border-0 border-b border-input bg-transparent focus:border-foreground focus-visible:ring-0',
        'group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:p-2!',
      )}
    >
      <Search className="size-4 shrink-0 mr-auto" />
      <span className="flex-1 text-left text-muted-foreground group-data-[collapsible=icon]:hidden">
        {t('Search...')}
      </span>
      <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted py-0.5 px-1 font-mono text-[9px] font-medium sm:flex group-data-[collapsible=icon]:hidden!">
        {isMac ? '⌘' : 'Ctrl'}&nbsp;K
      </kbd>
    </Button>
  );
}
