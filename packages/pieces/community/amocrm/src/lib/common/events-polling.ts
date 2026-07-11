import {
  InputPropertyMap,
  StaticPropsValue,
  TriggerStrategy,
  createTrigger,
} from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { AmoEvent, AmoEventCursor, amoEvents } from './events';

export const createAmoEventsPollingTrigger = ({
  name,
  displayName,
  description,
  aiMetadata,
  types,
  typesFromProps,
  entity,
  filterEvent,
  props = {},
  sampleData,
}: CreateAmoEventsPollingTriggerParams) =>
  createTrigger({
    auth: amocrmAuth,
    name,
    displayName,
    description,
    aiMetadata,
    type: TriggerStrategy.POLLING,
    props,
    sampleData,
    async onEnable(context) {
      await context.store.put<AmoEventCursor>(CURSOR_KEY, initialCursor());
      context.setSchedule({ cronExpression: EVERY_MINUTE_CRON });
    },
    async onDisable(context) {
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
        types: resolveTypes({ types, typesFromProps, propsValue: context.propsValue }),
        entity,
      });

      const { fresh, next } = amoEvents.advanceCursor({ events, cursor });
      await context.store.put<AmoEventCursor>(CURSOR_KEY, next);
      return filterEvent
        ? fresh.filter((event) => filterEvent(event, context.propsValue))
        : fresh;
    },
    async test(context) {
      const events = await amoEvents.fetchEvents({
        auth: context.auth.props,
        from: nowSeconds() - TEST_LOOKBACK_SECONDS,
        types: resolveTypes({ types, typesFromProps, propsValue: context.propsValue }),
        entity,
        limit: 5,
        maxPages: 1,
      });
      return events.length > 0 ? events : [sampleData];
    },
  });

function resolveTypes({
  types,
  typesFromProps,
  propsValue,
}: {
  types?: string[];
  typesFromProps?: (propsValue: StaticPropsValue<InputPropertyMap>) => string[];
  propsValue: StaticPropsValue<InputPropertyMap>;
}): string[] | undefined {
  if (typesFromProps) {
    return typesFromProps(propsValue);
  }
  return types;
}

function initialCursor(): AmoEventCursor {
  return { lastCreatedAt: nowSeconds(), lastIds: [] };
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

const CURSOR_KEY = 'cursor';
const EVERY_MINUTE_CRON = '* * * * *';
const TEST_LOOKBACK_SECONDS = 7 * 24 * 60 * 60;

type CreateAmoEventsPollingTriggerParams = {
  name: string;
  displayName: string;
  description: string;
  aiMetadata: { description: string };
  types?: string[];
  typesFromProps?: (propsValue: StaticPropsValue<InputPropertyMap>) => string[];
  entity?: string;
  filterEvent?: (event: AmoEvent, propsValue: StaticPropsValue<InputPropertyMap>) => boolean;
  props?: InputPropertyMap;
  sampleData: unknown;
};
