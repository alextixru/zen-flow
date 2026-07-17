import {
  ACTIVEPIECES_CHAT_TIERS,
  AIProviderModelType,
  AIProviderName,
} from '@activepieces/shared';
import { t } from 'i18next';
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  CornerDownLeft,
  Equal,
  Lightbulb,
  Rocket,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { aiProviderQueries } from '@/features/platform-admin';
import { cn } from '@/lib/utils';

const TIER_CONFIG: Record<
  string,
  {
    icon: React.ComponentType<{ className?: string }>;
    displayLabel: string;
    description: string;
  }
> = {
  fast: {
    icon: Equal,
    displayLabel: 'Fast',
    description: 'Quick replies for simple tasks',
  },
  smart: {
    icon: Lightbulb,
    displayLabel: 'Expert',
    description: 'Best for everyday use',
  },
  premium: {
    icon: Rocket,
    displayLabel: 'Heavy',
    description: 'Highest quality, a bit slower',
  },
};

const TIER_OPTIONS: ModelOption[] = ACTIVEPIECES_CHAT_TIERS.map((tier) => {
  const config = TIER_CONFIG[tier.id];
  return {
    id: tier.id,
    label: config?.displayLabel ?? tier.label,
    description: config?.description ?? '',
    icon: config?.icon ?? Lightbulb,
    translate: true,
  };
});

export function ChatModelSelector({
  selectedModel,
  onModelChange,
}: {
  selectedModel: string | null;
  onModelChange: (modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: providers } = aiProviderQueries.useAiProviders();
  const chatProvider = providers?.find((p) => p.enabledForChat);
  const isCustomProvider = chatProvider?.provider === AIProviderName.CUSTOM;
  const { data: customModels } = aiProviderQueries.useAiProviderModels({
    provider: chatProvider?.provider,
    enabled: isCustomProvider,
  });

  // Для CUSTOM-провайдера чат работает с моделями из его конфига (бэкенд-зеркало:
  // chat-helpers.customChatModels). Первая модель списка — дефолт и «быстрый» раунд.
  const customOptions: ModelOption[] = (customModels ?? [])
    .filter((m) => m.type === AIProviderModelType.TEXT)
    .map((m) => ({
      id: m.id,
      label: m.name,
      description: m.id,
      icon: Bot,
      translate: false,
    }));
  const options =
    isCustomProvider && customOptions.length > 0 ? customOptions : TIER_OPTIONS;

  const fallbackOption =
    options.find((o) => o.id === 'smart') ?? options[0] ?? TIER_OPTIONS[1];
  const selectedOption =
    options.find((o) => o.id === selectedModel) ?? fallbackOption;

  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.id === selectedOption.id);
    setFocusedIndex(idx >= 0 ? idx : 0);
    const rafId = requestAnimationFrame(() => listRef.current?.focus());
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedOption.id]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const option = options[focusedIndex];
        if (option) {
          onModelChange(option.id);
          setOpen(false);
        }
      }
    },
    [focusedIndex, onModelChange, options],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className="h-7 gap-1 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <span>
            {selectedOption.translate
              ? t(selectedOption.label)
              : selectedOption.label}
          </span>
          <ChevronDown className="size-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[330px] p-0"
        align="end"
        side="top"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div
          ref={listRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="outline-none"
        >
          <div className="py-1">
            {options.map((option, index) => {
              const Icon = option.icon;
              const isSelected = selectedOption.id === option.id;
              const isFocused = focusedIndex === index;
              return (
                <div
                  key={option.id}
                  onClick={() => {
                    onModelChange(option.id);
                    setOpen(false);
                  }}
                  onMouseEnter={() => setFocusedIndex(index)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3.5 cursor-pointer transition-colors',
                    isFocused && 'bg-accent',
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-background">
                    <Icon className="size-4 text-foreground" />
                  </div>
                  <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-medium truncate">
                      {option.translate ? t(option.label) : option.label}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {option.translate
                        ? t(option.description)
                        : option.description}
                    </span>
                  </div>
                  <Check
                    className={cn(
                      'size-4 shrink-0',
                      isSelected ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <kbd className="flex h-5 w-5 items-center justify-center rounded border bg-muted">
                <ArrowUp className="size-3" />
              </kbd>
              <kbd className="flex h-5 w-5 items-center justify-center rounded border bg-muted">
                <ArrowDown className="size-3" />
              </kbd>
              <span>{t('to navigate')}</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="flex h-5 w-5 items-center justify-center rounded border bg-muted">
                <CornerDownLeft className="size-3" />
              </kbd>
              <span>{t('to select')}</span>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type ModelOption = {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  translate: boolean;
};
