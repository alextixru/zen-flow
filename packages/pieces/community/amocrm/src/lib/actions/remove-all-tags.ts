import { createAction } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { tagsUtils, taskEntityDropdown } from '../common';

export const removeAllTags = createAction({
  auth: amocrmAuth,
  name: 'remove_all_tags',
  displayName: 'Remove All Tags',
  description: 'Removes every tag from a lead, contact or company.',
  aiMetadata: {
    description:
      'Clears all tags from a lead, contact or company in amoCRM. Use to reset an entity to no tags. Idempotent.',
    idempotent: true,
  },
  props: {
    entity_type: tagsUtils.entityTypeProperty(),
    entity_id: taskEntityDropdown({ required: true }),
  },
  async run(context) {
    const auth = context.auth.props;
    const { entity_type, entity_id } = context.propsValue;
    return await tagsUtils.patchTags({ auth, entityType: entity_type, entityId: entity_id, tags: [] });
  },
});
