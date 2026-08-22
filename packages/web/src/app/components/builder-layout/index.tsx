import { ApEdition, ApFlagId } from '@activepieces/shared';

import { useEmbedding } from '@/components/providers/embed-provider';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar-shadcn';
import { PurchaseExtraFlowsDialog } from '@/features/billing';
import { flagsHooks } from '@/hooks/flags-hooks';
import { cn } from '@/lib/utils';

import {
  GlobalSearchProvider,
  useGlobalSearch,
} from '../global-search/global-search-context';
import { ProjectDashboardSidebar } from '../sidebar/dashboard';

export function BuilderLayout({ children }: { children: React.ReactNode }) {
  return (
    <GlobalSearchProvider>
      <BuilderLayoutInner>{children}</BuilderLayoutInner>
    </GlobalSearchProvider>
  );
}

function BuilderLayoutInner({ children }: { children: React.ReactNode }) {
  const { data: edition } = flagsHooks.useFlag<ApEdition>(ApFlagId.EDITION);
  const { embedState } = useEmbedding();
  const { open: searchOpen } = useGlobalSearch();

  return (
    <SidebarProvider hoverMode={!searchOpen} defaultOpen={false}>
      {!embedState.isEmbedded && <ProjectDashboardSidebar />}
      <SidebarInset className="flex flex-col h-full overflow-hidden bg-sidebar">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div
            className={cn(
              'flex flex-col h-full bg-background overflow-hidden',
              // Zen DS: как контент-контейнер дашборда — плоский лист с жирной линией слева
              embedState.isEmbedded
                ? 'border-l'
                : 'border-l-2 border-foreground',
            )}
          >
            {children}
          </div>
        </div>
        {edition === ApEdition.CLOUD && <PurchaseExtraFlowsDialog />}
      </SidebarInset>
    </SidebarProvider>
  );
}
