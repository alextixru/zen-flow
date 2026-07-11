import { strict as assert } from 'node:assert';
import { describe, it } from 'vitest';
import { waitCycle } from './wait-cycle';

const NOW = 1_700_000_000;

describe('waitCycle.computeDeadline', () => {
  it('adds timeout hours to now', () => {
    assert.equal(waitCycle.computeDeadline({ nowSec: NOW, timeoutHours: 24 }), NOW + 24 * 3600);
  });

  it('clamps non-positive timeout to at least one hour', () => {
    assert.equal(waitCycle.computeDeadline({ nowSec: NOW, timeoutHours: 0 }), NOW + 3600);
  });
});

describe('waitCycle.isTimedOut', () => {
  it('false before the deadline', () => {
    assert.equal(waitCycle.isTimedOut({ nowSec: NOW, deadline: NOW + 60 }), false);
  });

  it('true at and past the deadline', () => {
    assert.equal(waitCycle.isTimedOut({ nowSec: NOW, deadline: NOW }), true);
    assert.equal(waitCycle.isTimedOut({ nowSec: NOW + 1, deadline: NOW }), true);
  });
});
