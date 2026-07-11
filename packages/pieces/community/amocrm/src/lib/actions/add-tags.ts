import { Property, createAction } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { tagsUtils, taskEntityDropdown } from '../common';

export const addTags = createAction({
  auth: amocrmAuth,
  name: 'add_tags',
  displayName: 'Add Tags',
  description: 'Adds tags to a lead, contact or company without removing existing ones.',
  aiMetadata: {
    description:
      'Adds one or more tags to a lead, contact or company in amoCRM, preserving the tags already set. Use to label an entity. Idempotent — re-adding an existing tag has no effect.',
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
    const merged = tagsUtils.mergeTags({ existing, incoming: tags.map((tag) => String(tag)) });
    return await tagsUtils.patchTags({ auth, entityType: entity_type, entityId: entity_id, tags: merged });
  },
});
