import { t } from 'i18next';

const FlowEndWidget = () => {
  return (
    <div
      className="text-center w-fit min-w-[41px] bg-builder-background text-foreground/70 rounded-md animate-fade -translate-x-1/2"
      key={'flow-end-button'}
      id="flow-end-button"
    >
      <div className="w-full text-center text-sm h-full bg-border/80 p-1 rounded-md">
        {t('End')}
      </div>
    </div>
  );
};

FlowEndWidget.displayName = 'FlowEndWidget';
export default FlowEndWidget;
