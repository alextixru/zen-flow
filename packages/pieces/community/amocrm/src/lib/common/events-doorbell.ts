import { HttpMethod } from '@activepieces/pieces-common';
import {
  InputPropertyMap,
  StaticPropsValue,
  TriggerStrategy,
  createTrigger,
} from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { amoClient } from './client';
import { AmoEvent, AmoEventCursor, amoEvents } from './events';

export const createAmoDoorbellTrigger = ({
  name,
  displayName,
  description,
  aiMetadata,
  webhookEvents,
  eventTypes,
  eventTypesFromProps,
  entity,
  filterEvent,
  props = {},
  sampleData,
}: CreateAmoDoorbellTriggerParams) =>
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
        body: { destination: context.webhookUrl, settings: webhookEvents },
      });
      await context.store.put<AmoEventCursor>(CURSOR_KEY, initialCursor());
    },
    async onDisable(context) {
      const auth = context.auth.props;
      await amoClient.makeRequest({
        auth,
        method: HttpMethod.DELETE,
        path: '/webhooks',
        body: { destination: context.webhookUrl },
      });
      await context.store.delete(CURSOR_KEY);
    },
    async run(context) {
      const cursor = await context.store.get<AmoEventCursor>(CURSOR_KEY);
      if (!cursor) {
        await context.store.put<AmoEventCursor>(CURSOR_KEY, initialCursor());
        return [];
      }

      const events = await amoEvents.fetchEvents({
        auth: context.auth.props,
        from: cursor.lastCreatedAt,
        types: resolveTypes({ eventTypes, eventTypesFromProps, propsValue: context.propsValue }),
        entity,
      });

      const { fresh, next } = amoEvents.advanceCursor({ events, cursor });
      // Feed lags the doorbell webhook (indexing delay): empty fresh leaves the
      // cursor untouched (advanceCursor returns next === cursor) so the event is
      // picked up on the next ring.
      if (fresh.length === 0) {
        return [];
      }
      await context.store.put<AmoEventCursor>(CURSOR_KEY, next);
      return filterEvent
        ? fresh.filter((event) => filterEvent(event, context.propsValue))
        : fresh;
    },
    async test(context) {
      const events = await amoEvents.fetchEvents({
        auth: context.auth.props,
        from: nowSeconds() - TEST_LOOKBACK_SECONDS,
        types: resolveTypes({ eventTypes, eventTypesFromProps, propsValue: context.propsValue }),
        entity,
        limit: 5,
        maxPages: 1,
      });
      return events.length > 0 ? events : [sampleData];
    },
  });

function resolveTypes({
  eventTypes,
  eventTypesFromProps,
  propsValue,
}: {
  eventTypes?: string[];
  eventTypesFromProps?: (propsValue: StaticPropsValue<InputPropertyMap>) => string[];
  propsValue: StaticPropsValue<InputPropertyMap>;
}): string[] | undefined {
  if (eventTypesFromProps) {
    return eventTypesFromProps(propsValue);
  }
  return eventTypes;
}

function initialCursor(): AmoEventCursor {
  return { lastCreatedAt: nowSeconds(), lastIds: [] };
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

const CURSOR_KEY = 'cursor';
const TEST_LOOKBACK_SECONDS = 7 * 24 * 60 * 60;

type CreateAmoDoorbellTriggerParams = {
  name: string;
  displayName: string;
  description: string;
  aiMetadata: { description: string };
  webhookEvents: string[];
  eventTypes?: string[];
  eventTypesFromProps?: (propsValue: StaticPropsValue<InputPropertyMap>) => string[];
  entity?: string;
  filterEvent?: (event: AmoEvent, propsValue: StaticPropsValue<InputPropertyMap>) => boolean;
  props?: InputPropertyMap;
  sampleData: unknown;
};
