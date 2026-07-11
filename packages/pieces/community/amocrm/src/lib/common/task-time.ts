import { isNil } from '@activepieces/pieces-framework';

function computeCompleteTill({
  offsetValue,
  offsetUnit,
  dueAt,
  now,
}: ComputeCompleteTillParams): number | undefined {
  if (!isNil(dueAt) && dueAt !== '') {
    const parsed = Date.parse(dueAt);
    if (!Number.isNaN(parsed)) {
      return Math.floor(parsed / 1000);
    }
  }
  if (!isNil(offsetValue) && isOffsetUnit(offsetUnit)) {
    return now + offsetValue * OFFSET_UNIT_SECONDS[offsetUnit];
  }
  return undefined;
}

export const taskTime = { computeCompleteTill };

export type TaskOffsetUnit = 'minutes' | 'hours' | 'days';

function isOffsetUnit(value: unknown): value is TaskOffsetUnit {
  return value === 'minutes' || value === 'hours' || value === 'days';
}

const OFFSET_UNIT_SECONDS: Record<TaskOffsetUnit, number> = {
  minutes: 60,
  hours: 3600,
  days: 86400,
};

type ComputeCompleteTillParams = {
  offsetValue?: number;
  offsetUnit?: string;
  dueAt?: string;
  now: number;
};
