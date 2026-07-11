import { Property, isNil } from '@activepieces/pieces-framework';
import { AmoEvent } from './events';

const entityProperty = Property.StaticDropdown({
  displayName: 'Entity',
  description: 'Which entity type to watch for tag changes.',
  required: true,
  defaultValue: 'leads',
  options: {
    options: [
      { label: 'Lead', value: 'leads' },
      { label: 'Contact', value: 'contacts' },
      { label: 'Company', value: 'companies' },
    ],
  },
});

const tagNameProperty = Property.ShortText({
  displayName: 'Tag Name',
  description: 'Only fire for this exact tag name. Leave empty to fire for any tag.',
  required: false,
});

function webhookEvent(entity: string): string {
  return ENTITY_WEBHOOK_EVENT[entity] ?? 'update_lead';
}

function matchesEntityAndTag({
  event,
  entity,
  tagName,
}: {
  event: AmoEvent;
  entity: unknown;
  tagName: unknown;
}): boolean {
  // The doorbell webhook only rings for the selected entity, but the feed pull
  // is not entity-scoped, so a same-window tag change on another entity would
  // otherwise leak through — gate on entity_type here.
  if (event['entity_type'] !== ENTITY_TYPE[String(entity)]) {
    return false;
  }
  if (isNil(tagName) || String(tagName).trim() === '') {
    return true;
  }
  const wanted = String(tagName).trim();
  return [event['value_after'], event['value_before']].some((changes) => hasTagNamed(changes, wanted));
}

function hasTagNamed(changes: unknown, wanted: string): boolean {
  if (!Array.isArray(changes)) {
    return false;
  }
  return changes.some((change) => {
    if (!isRecord(change) || !isRecord(change['tag'])) {
      return false;
    }
    return change['tag']['name'] === wanted;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const ENTITY_WEBHOOK_EVENT: Record<string, string> = {
  leads: 'update_lead',
  contacts: 'update_contact',
  companies: 'update_company',
};

const ENTITY_TYPE: Record<string, string> = {
  leads: 'lead',
  contacts: 'contact',
  companies: 'company',
};

export const entityTagUtils = {
  entityProperty,
  tagNameProperty,
  webhookEvent,
  matchesEntityAndTag,
};
