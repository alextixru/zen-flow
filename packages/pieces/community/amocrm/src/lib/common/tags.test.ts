import { strict as assert } from 'node:assert';
import { describe, it } from 'vitest';
import { tagsUtils } from './tags';

describe('tagsUtils.normalizeEntityTags', () => {
  it('keeps id/name objects and drops junk', () => {
    assert.deepEqual(
      tagsUtils.normalizeEntityTags([{ id: 1, name: 'a' }, { name: 'b' }, 'x', null, {}]),
      [{ id: 1, name: 'a' }, { id: undefined, name: 'b' }],
    );
  });

  it('returns [] for non-array', () => {
    assert.deepEqual(tagsUtils.normalizeEntityTags(undefined), []);
  });
});

describe('tagsUtils.mergeTags', () => {
  it('preserves existing by id and adds new by name', () => {
    assert.deepEqual(
      tagsUtils.mergeTags({ existing: [{ id: 1, name: 'a' }], incoming: ['b'] }),
      [{ id: 1 }, { name: 'b' }],
    );
  });

  it('skips names already present (case-insensitive) and dedups input', () => {
    assert.deepEqual(
      tagsUtils.mergeTags({ existing: [{ id: 1, name: 'VIP' }], incoming: ['vip', 'new', 'new', ' '] }),
      [{ id: 1 }, { name: 'new' }],
    );
  });
});

describe('tagsUtils.removeTags', () => {
  it('removes only the named tags, keeps others by id', () => {
    assert.deepEqual(
      tagsUtils.removeTags({
        existing: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }],
        toRemove: ['A'],
      }),
      [{ id: 2 }],
    );
  });

  it('matches by id string too', () => {
    assert.deepEqual(
      tagsUtils.removeTags({ existing: [{ id: 5, name: 'x' }], toRemove: ['5'] }),
      [],
    );
  });
});
