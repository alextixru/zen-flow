import { cn } from '@/lib/utils';

const LargeWidgetWrapper = ({
  children,
  containerClassName,
}: {
  children: React.ReactNode;
  containerClassName?: string;
}) => {
  return (
    <div className="absolute top-[12px] z-40 w-full px-2 flex justify-center">
      <div
        className={cn(
          // Zen DS: баннер — чистая плашка с карточной тенью, без рамки
          'py-1.5 px-3.5 min-h-11.5 bg-background shadow-[0_1px_3px_rgb(0_0_0_/_0.06)] z-40 w-full animate animate-fade duration-300 rounded-sm flex items-center justify-between',
          containerClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
};
LargeWidgetWrapper.displayName = 'LargeWidgetWrapper';
export default LargeWidgetWrapper;
