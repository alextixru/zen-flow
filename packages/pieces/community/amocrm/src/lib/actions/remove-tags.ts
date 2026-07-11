import { Property, createAction } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { tagsUtils, taskEntityDropdown } from '../common';

export const removeTags = createAction({
  auth: amocrmAuth,
  name: 'remove_tags',
  displayName: 'Remove Tags',
  description: 'Removes the specified tags from a lead, contact or company, keeping the rest.',
  aiMetadata: {
    description:
      'Removes one or more tags (matched by name or id) from a lead, contact or company in amoCRM while keeping any other tags. Idempotent — removing a tag that is not set has no effect.',
    idempotent: true,
  },
  props: {
    entity_type: tagsUtils.entityTypeProperty(),
    entity_id: taskEntityDropdown({ required: true }),
    tags: Property.Array({ displayName: 'Tags', required: true }),
  },
  async run(context) {
    const auth = context.auth.props;
    const { entity_type, entity_id, tags } = context.propsValue;
    const existing = await tagsUtils.fetchEntityTags({ auth, entityType: entity_type, entityId: entity_id });
    const remaining = tagsUtils.removeTags({ existing, toRemove: tags.map((tag) => String(tag)) });
    return await tagsUtils.patchTags({ auth, entityType: entity_type, entityId: entity_id, tags: remaining });
  },
});
