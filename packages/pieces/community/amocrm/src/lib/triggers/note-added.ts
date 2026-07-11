import { HttpMethod } from '@activepieces/pieces-common';
import {
  Property,
  TriggerStrategy,
  createTrigger,
} from '@activepieces/pieces-framework';
import { amoClient } from '../common/client';
import { amocrmAuth } from '../auth';

export const noteAdded = createTrigger({
  auth: amocrmAuth,
  name: 'note_added',
  displayName: 'Note Added',
  description: 'Triggers when a note is added to a lead, contact or company.',
  aiMetadata: {
    description:
      'Fires when a note is created on the selected entity type (lead, contact or company) in amoCRM, emitting the note payload.',
  },
  type: TriggerStrategy.WEBHOOK,
  props: {
    entity: Property.StaticDropdown({
      displayName: 'Entity',
      description: 'Which entity type to watch for new notes.',
      required: true,
      defaultValue: 'lead',
      options: {
        options: [
          { label: 'Lead', value: 'lead' },
          { label: 'Contact', value: 'contact' },
          { label: 'Company', value: 'company' },
        ],
      },
    }),
  },
  sampleData: {
    id: 281146381,
    entity_id: 38653627,
    created_by: 0,
    updated_by: 0,
    created_at: 1783728316,
    updated_at: 1783728316,
    responsible_user_id: 2898108,
    group_id: 0,
    note_type: 'common',
    params: { text: 'Example note text' },
    account_id: 32453394,
  },
  async onEnable(context) {
    const auth = context.auth.props;
    await amoClient.makeRequest({
      auth,
      method: HttpMethod.POST,
      path: '/webhooks',
      body: {
        destination: context.webhookUrl,
        settings: [`note_${context.propsValue.entity}`],
      },
    });
  },
  async onDisable(context) {
    const auth = context.auth.props;
    await amoClient.makeRequest({
      auth,
      method: HttpMethod.DELETE,
      path: '/webhooks',
      body: { destination: context.webhookUrl },
    });
  },
  async run(context) {
    const plural = ENTITY_PLURAL[context.propsValue.entity];
    return resolveEventEntries({
      body: context.payload.body,
      payloadPath: `${plural}.note`,
    });
  },
  async test(context) {
    const auth = context.auth.props;
    const plural = ENTITY_PLURAL[context.propsValue.entity];
    const latest = await amoClient.makeRequest({
      auth,
      method: HttpMethod.GET,
      path: `/${plural}?limit=1&order[updated_at]=desc`,
    });
    const parentId = readId(extractEmbedded({ response: latest, key: plural })[0]);
    if (parentId === null) {
      return [];
    }
    const notes = await amoClient.makeRequest({
      auth,
      method: HttpMethod.GET,
      path: `/${plural}/${parentId}/notes?limit=5`,
    });
    return extractEmbedded({ response: notes, key: 'notes' });
  },
});

function resolveEventEntries({
  body,
  payloadPath,
}: {
  body: unknown;
  payloadPath: string;
}): unknown[] {
  let current: unknown = body;
  for (const segment of payloadPath.split('.')) {
    if (!isRecord(current)) {
      return [];
    }
    current = current[segment];
  }
  return Array.isArray(current) ? current : [];
}

function extractEmbedded({
  response,
  key,
}: {
  response: unknown;
  key: string;
}): unknown[] {
  if (!isRecord(response) || !isRecord(response['_embedded'])) {
    return [];
  }
  const embedded = response['_embedded'][key];
  return Array.isArray(embedded) ? embedded : [];
}

function readId(entry: unknown): number | string | null {
  if (!isRecord(entry)) {
    return null;
  }
  const id = entry['id'];
  return typeof id === 'number' || typeof id === 'string' ? id : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const ENTITY_PLURAL: Record<string, string> = {
  lead: 'leads',
  contact: 'contacts',
  company: 'companies',
};
