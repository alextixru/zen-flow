import { Property } from '@activepieces/pieces-framework';

// ponytail: self-driving DELAY poll cycle. Replaces account-wide webhook resume
// (which fired on the FIRST matching event anywhere in the account and burned a
// slot against amo's ~100-webhook-per-account limit). On each RESUME the action
// re-checks the specific task/conversation via /events and, if not done yet,
// re-pauses with a fresh DELAY waitpoint until `timeout_hours` elapses. Re-pause
// on RESUME is verified working on this fork (see ralph T038 spike).

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function computeDeadline({ nowSec, timeoutHours }: DeadlineParams): number {
  return nowSec + Math.max(1, timeoutHours) * 3600;
}

function nextResumeDateTime({ intervalMinutes }: IntervalParams): string {
  const minutes = Math.max(1, intervalMinutes);
  return new Date(Date.now() + minutes * 60 * 1000).toUTCString();
}

function isTimedOut({ nowSec, deadline }: TimeoutParams): boolean {
  return nowSec >= deadline;
}

export const waitCycle = {
  nowSeconds,
  computeDeadline,
  nextResumeDateTime,
  isTimedOut,
};

export const waitCycleProps = {
  check_interval_minutes: Property.Number({
    displayName: 'Check Interval (minutes)',
    description: 'How often to re-check while waiting. Minimum 1 minute.',
    required: false,
    defaultValue: 5,
  }),
  timeout_hours: Property.Number({
    displayName: 'Timeout (hours)',
    description:
      'Give up after this many hours and continue the flow with timed_out = true.',
    required: false,
    defaultValue: 24,
  }),
};

type DeadlineParams = { nowSec: number; timeoutHours: number };
type IntervalParams = { intervalMinutes: number };
type TimeoutParams = { nowSec: number; deadline: number };
