import { HttpMethod } from '@activepieces/pieces-common';
import {
  InputPropertyMap,
  TriggerStrategy,
  createTrigger,
} from '@activepieces/pieces-framework';
import { AmocrmAuthProps, amoClient } from './client';
import { amocrmAuth } from '../auth';

export const createAmoWebhookTrigger = ({
  name,
  displayName,
  description,
  aiMetadata,
  events,
  payloadPath,
  entityType,
  sampleData,
  fetchFullRecord = true,
  testFn,
  props = {},
}: CreateAmoWebhookTriggerParams) =>
  createTrigger({
    auth: amocrmAuth,
    name,
    displayName,
    description,
    aiMetadata,
    type: TriggerStrategy.WEBHOOK,
    props,
    sampleData,
    async onEnable(context) {
      const auth = context.auth.props;
      await amoClient.makeRequest({
        auth,
        method: HttpMethod.POST,
        path: '/webhooks',
        body: { destination: context.webhookUrl, settings: events },
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
      const auth = context.auth.props;
      const entries = resolveEventEntries({
        body: context.payload.body,
        payloadPath,
      });
      if (entries.length === 0) {
        return [];
      }

      if (!fetchFullRecord) {
        return entries;
      }

      const records = await Promise.all(
        entries.map((entry) =>
          fetchRecord({ auth, entityType, id: readId(entry) }),
        ),
      );
      return records.filter((record) => record !== null);
    },
    async test(context) {
      const auth = context.auth.props;
      if (testFn) {
        return testFn({ auth });
      }
      const response = await amoClient.makeRequest({
        auth,
        method: HttpMethod.GET,
        path: `/${entityType}?limit=5&order[updated_at]=desc`,
      });
      return extractEmbedded({ response, key: entityType });
    },
  });

async function fetchRecord({
  auth,
  entityType,
  id,
}: {
  auth: AmocrmAuthProps;
  entityType: string;
  id: number | string | null;
}): Promise<unknown> {
  if (id === null) {
    return null;
  }
  return amoClient.makeRequest({
    auth,
    method: HttpMethod.GET,
    path: `/${entityType}/${id}?with=contacts,companies,catalog_elements`,
  });
}

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

function readId(entry: unknown): number | string | null {
  if (!isRecord(entry)) {
    return null;
  }
  const id = entry['id'];
  return typeof id === 'number' || typeof id === 'string' ? id : null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

type CreateAmoWebhookTriggerParams = {
  name: string;
  displayName: string;
  description: string;
  aiMetadata: { description: string };
  events: string[];
  payloadPath: string;
  entityType: string;
  sampleData: unknown;
  fetchFullRecord?: boolean;
  testFn?: (params: { auth: AmocrmAuthProps }) => Promise<unknown[]>;
  props?: InputPropertyMap;
};
