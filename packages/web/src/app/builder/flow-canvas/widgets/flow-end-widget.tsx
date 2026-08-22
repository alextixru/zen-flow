import { t } from 'i18next';

const FlowEndWidget = () => {
  return (
    <div
      className="text-center w-fit min-w-[41px] bg-builder-background text-foreground/70 rounded-md animate-fade -translate-x-1/2"
      key={'flow-end-button'}
      id="flow-end-button"
    >
      {/* Zen DS: mono-uppercase марка на чистой плашке */}
      <div className="w-full text-center font-mono text-[11px] uppercase tracking-wider h-full bg-background text-muted-foreground shadow-[0_1px_3px_rgb(0_0_0_/_0.06)] px-2 py-1.5 rounded-sm">
        {t('End')}
      </div>
    </div>
  );
};

FlowEndWidget.displayName = 'FlowEndWidget';
export default FlowEndWidget;
