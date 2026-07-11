import { strict as assert } from 'node:assert';
import { describe, it } from 'vitest';
import { taskTime } from './task-time';

const NOW = 1_700_000_000;

describe('taskTime.computeCompleteTill', () => {
  it('offset in minutes', () => {
    assert.equal(
      taskTime.computeCompleteTill({ offsetValue: 30, offsetUnit: 'minutes', now: NOW }),
      NOW + 30 * 60,
    );
  });

  it('offset in hours', () => {
    assert.equal(
      taskTime.computeCompleteTill({ offsetValue: 2, offsetUnit: 'hours', now: NOW }),
      NOW + 2 * 3600,
    );
  });

  it('offset in days', () => {
    assert.equal(
      taskTime.computeCompleteTill({ offsetValue: 3, offsetUnit: 'days', now: NOW }),
      NOW + 3 * 86400,
    );
  });

  it('explicit dueAt ISO takes precedence over offset', () => {
    const dueAt = '2024-01-01T00:00:00Z';
    assert.equal(
      taskTime.computeCompleteTill({ offsetValue: 5, offsetUnit: 'days', dueAt, now: NOW }),
      Math.floor(Date.parse(dueAt) / 1000),
    );
  });

  it('returns undefined when neither offset nor dueAt is given', () => {
    assert.equal(taskTime.computeCompleteTill({ now: NOW }), undefined);
  });

  it('falls back to offset when dueAt is invalid', () => {
    assert.equal(
      taskTime.computeCompleteTill({ offsetValue: 1, offsetUnit: 'hours', dueAt: 'not-a-date', now: NOW }),
      NOW + 3600,
    );
  });
});
