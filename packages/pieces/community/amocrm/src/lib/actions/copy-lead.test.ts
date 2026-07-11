import { strict as assert } from 'node:assert';
import { describe, it } from 'vitest';
import { copyLeadInternals } from './copy-lead';

const STATUSES = [
  { id: 100, type: 1, sort: 10 },
  { id: 200, type: 0, sort: 20 },
  { id: 300, type: 0, sort: 30 },
  { id: 142, type: 0, sort: 10000 },
  { id: 143, type: 0, sort: 11000 },
];

describe('copyLeadInternals.resolveTargetStatusId', () => {
  it('uses the explicit target status when provided', () => {
    assert.equal(
      copyLeadInternals.resolveTargetStatusId({
        sourcePipelineId: 1,
        sourceStatusId: 200,
        targetPipelineId: 1,
        targetStatusId: 300,
        statuses: STATUSES,
      }),
      300,
    );
  });

  it('keeps the source status when the pipeline is unchanged and status is a real stage', () => {
    assert.equal(
      copyLeadInternals.resolveTargetStatusId({
        sourcePipelineId: 1,
        sourceStatusId: 200,
        targetPipelineId: 1,
        targetStatusId: undefined,
        statuses: STATUSES,
      }),
      200,
    );
  });

  it('skips the unsorted status and falls back to the first normal stage', () => {
    assert.equal(
      copyLeadInternals.resolveTargetStatusId({
        sourcePipelineId: 1,
        sourceStatusId: 100,
        targetPipelineId: 1,
        targetStatusId: undefined,
        statuses: STATUSES,
      }),
      200,
    );
  });

  it('moves to the first normal stage of the target pipeline when the pipeline changes', () => {
    assert.equal(
      copyLeadInternals.resolveTargetStatusId({
        sourcePipelineId: 1,
        sourceStatusId: 200,
        targetPipelineId: 2,
        targetStatusId: undefined,
        statuses: STATUSES,
      }),
      200,
    );
  });
});
