import { createAmoDoorbellTrigger } from '../common/events-doorbell';
import { entityTagUtils } from '../common/entity-tag';

export const entityTagDeleted = createAmoDoorbellTrigger({
  name: 'entity_tag_deleted',
  displayName: 'Tag Removed',
  description:
    'Triggers when a tag is removed from a lead, contact or company. Optionally filter by tag name. Emits the amo event with value_before holding the removed tag.',
  aiMetadata: {
    description:
      'Fires when a tag is removed from a lead, contact or company in amoCRM, emitting the amo event whose value_before holds the removed tag name.',
  },
  props: {
    entity: entityTagUtils.entityProperty,
    tag_name: entityTagUtils.tagNameProperty,
  },
  webhookEventsFromProps: (propsValue) => [entityTagUtils.webhookEvent(String(propsValue['entity']))],
  eventTypes: ['entity_tag_deleted'],
  filterEvent: (event, propsValue) =>
    entityTagUtils.matchesEntityAndTag({
      event,
      entity: propsValue['entity'],
      tagName: propsValue['tag_name'],
    }),
  sampleData: {
    id: '01kx8a7nbghmv9nxfk57ydjqqn',
    type: 'entity_tag_deleted',
    entity_id: 36632537,
    entity_type: 'lead',
    created_by: 0,
    created_at: 1783764342,
    account_id: 32453394,
    value_after: [],
    value_before: [{ tag: { name: 't036-added' } }],
  },
});
