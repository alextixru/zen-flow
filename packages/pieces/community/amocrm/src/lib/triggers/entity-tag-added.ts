import { createAmoDoorbellTrigger } from '../common/events-doorbell';
import { entityTagUtils } from '../common/entity-tag';

export const entityTagAdded = createAmoDoorbellTrigger({
  name: 'entity_tag_added',
  displayName: 'Tag Added',
  description:
    'Triggers when a tag is added to a lead, contact or company. Optionally filter by tag name. Emits the amo event with value_after holding the added tag.',
  aiMetadata: {
    description:
      'Fires when a tag is added to a lead, contact or company in amoCRM, emitting the amo event whose value_after holds the added tag name.',
  },
  props: {
    entity: entityTagUtils.entityProperty,
    tag_name: entityTagUtils.tagNameProperty,
  },
  webhookEventsFromProps: (propsValue) => [entityTagUtils.webhookEvent(String(propsValue['entity']))],
  eventTypes: ['entity_tag_added'],
  filterEvent: (event, propsValue) =>
    entityTagUtils.matchesEntityAndTag({
      event,
      entity: propsValue['entity'],
      tagName: propsValue['tag_name'],
    }),
  sampleData: {
    id: '01kx8a71hhepytvcc66mc4qdnc',
    type: 'entity_tag_added',
    entity_id: 36632537,
    entity_type: 'lead',
    created_by: 0,
    created_at: 1783764321,
    account_id: 32453394,
    value_after: [{ tag: { name: 't036-added' } }],
    value_before: [],
  },
});
