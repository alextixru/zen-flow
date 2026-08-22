import * as React from 'react';
import TextareaAutosize from 'react-textarea-autosize';

import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: ResizableTextareaProps) {
  return (
    <TextareaAutosize
      data-slot="textarea"
      cacheMeasurements={false}
      minRows={1}
      maxRows={5}
      className={cn(
        // Zen DS: как input — только подчёркивание, без рамки и заливки
        'flex w-full rounded-none border-0 border-b border-input bg-transparent px-1 py-2 text-sm transition-[border-color] outline-none placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;
type Style = Omit<
  NonNullable<TextareaProps['style']>,
  'maxHeight' | 'minHeight'
> & {
  height?: number;
};
type TextareaHeightChangeMeta = {
  rowHeight: number;
};
interface TextareaAutosizeProps extends Omit<TextareaProps, 'style'> {
  maxRows?: number;
  minRows?: number;
  onHeightChange?: (height: number, meta: TextareaHeightChangeMeta) => void;
  cacheMeasurements?: boolean;
  style?: Style;
}

export type ResizableTextareaProps = TextareaAutosizeProps &
  React.RefAttributes<HTMLTextAreaElement>;
