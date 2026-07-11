import { HttpMethod } from '@activepieces/pieces-common';
import { AmocrmAuthProps, amoClient } from './client';

async function fetchEvents({
  auth,
  from,
  types,
  entity,
  entityIds,
  createdBy,
  to,
  limit,
  maxPages,
}: FetchEventsParams): Promise<AmoEvent[]> {
  const pageLimit = Math.min(limit ?? EVENTS_PAGE_LIMIT, EVENTS_PAGE_LIMIT);
  const pageCap = maxPages ?? DEFAULT_MAX_PAGES;
  const query = buildEventsQuery({ from, to, types, entity, entityIds, createdBy });

  let events: AmoEvent[] = [];
  for (let page = 1; page <= pageCap; page++) {
    query.set('page', String(page));
    query.set('limit', String(pageLimit));
    const response = await amoClient.makeRequest({
      auth,
      method: HttpMethod.GET,
      path: `/events?${query.toString()}`,
    });

    const pageEvents = readEvents(response);
    if (pageEvents.length === 0) {
      break;
    }
    events = events.concat(pageEvents);

    if (!hasNextPage(response)) {
      break;
    }
  }

  return events;
}

async function fetchEventTypes({ auth }: FetchEventTypesParams): Promise<AmoEventType[]> {
  const response = await amoClient.makeRequest({
    auth,
    method: HttpMethod.GET,
    path: '/events/types?language_code=ru',
  });

  if (!isRecord(response)) {
    return [];
  }
  const embedded = response['_embedded'];
  const list = isRecord(embedded) ? embedded['events_types'] : undefined;
  if (!Array.isArray(list)) {
    return [];
  }

  return list.reduce<AmoEventType[]>((acc, item) => {
    if (!isRecord(item)) {
      return acc;
    }
    const key = item['key'];
    if (typeof key !== 'string') {
      return acc;
    }
    return acc.concat({
      key,
      type: typeof item['type'] === 'number' ? item['type'] : undefined,
      lang: typeof item['lang'] === 'string' ? item['lang'] : key,
    });
  }, []);
}

// Cursor dedup: filter[created_at][from] is inclusive (>=), so the boundary
// second is re-fetched every poll; lastIds drops the events already emitted at
// lastCreatedAt, covering two events landing in the same second.
function advanceCursor({ events, cursor }: AdvanceCursorParams): AdvanceCursorResult {
  const fresh = events.filter((event) => {
    if (event.created_at < cursor.lastCreatedAt) {
      return false;
    }
    if (event.created_at === cursor.lastCreatedAt && cursor.lastIds.includes(event.id)) {
      return false;
    }
    return true;
  });

  if (fresh.length === 0) {
    return { fresh, next: cursor };
  }

  const lastCreatedAt = fresh.reduce((max, event) => Math.max(max, event.created_at), cursor.lastCreatedAt);
  // Carry the prior boundary ids when the second is unchanged, otherwise an
  // already-emitted event at that second would slip past the dedup next poll.
  const carriedIds = lastCreatedAt === cursor.lastCreatedAt ? cursor.lastIds : [];
  const freshIdsAtBoundary = fresh
    .filter((event) => event.created_at === lastCreatedAt)
    .map((event) => event.id);
  const lastIds = [...new Set([...carriedIds, ...freshIdsAtBoundary])];

  return { fresh, next: { lastCreatedAt, lastIds } };
}

function buildEventsQuery({
  from,
  to,
  types,
  entity,
  entityIds,
  createdBy,
}: BuildQueryParams): URLSearchParams {
  const query = new URLSearchParams();
  if (typeof from === 'number') {
    query.set('filter[created_at][from]', String(from));
  }
  if (typeof to === 'number') {
    query.set('filter[created_at][to]', String(to));
  }
  types?.forEach((type) => query.append('filter[type][]', type));
  if (entity) {
    query.append('filter[entity][]', entity);
  }
  entityIds?.forEach((id) => query.append('filter[entity_id][]', String(id)));
  createdBy?.forEach((id) => query.append('filter[created_by][]', String(id)));
  return query;
}

function readEvents(response: unknown): AmoEvent[] {
  if (!isRecord(response)) {
    return [];
  }
  const embedded = response['_embedded'];
  const list = isRecord(embedded) ? embedded['events'] : undefined;
  if (!Array.isArray(list)) {
    return [];
  }
  return list.reduce<AmoEvent[]>((acc, item) => {
    const event = toEvent(item);
    return event ? acc.concat(event) : acc;
  }, []);
}

function toEvent(item: unknown): AmoEvent | null {
  if (!isRecord(item)) {
    return null;
  }
  const id = item['id'];
  const createdAt = item['created_at'];
  if (typeof id !== 'string' || typeof createdAt !== 'number') {
    return null;
  }
  return { ...item, id, created_at: createdAt };
}

function hasNextPage(response: unknown): boolean {
  if (!isRecord(response)) {
    return false;
  }
  const links = response['_links'];
  return isRecord(links) && isRecord(links['next']);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const amoEvents = {
  fetchEvents,
  fetchEventTypes,
  advanceCursor,
};

const EVENTS_PAGE_LIMIT = 100;
const DEFAULT_MAX_PAGES = 5;

export type AmoEvent = {
  id: string;
  created_at: number;
} & Record<string, unknown>;

export type AmoEventType = {
  key: string;
  type?: number;
  lang: string;
};

export type AmoEventCursor = {
  lastCreatedAt: number;
  lastIds: string[];
};

type FetchEventsParams = {
  auth: AmocrmAuthProps;
  from?: number;
  types?: string[];
  entity?: string;
  entityIds?: Array<string | number>;
  createdBy?: number[];
  to?: number;
  limit?: number;
  maxPages?: number;
};

type FetchEventTypesParams = {
  auth: AmocrmAuthProps;
};

type AdvanceCursorParams = {
  events: AmoEvent[];
  cursor: AmoEventCursor;
};

type AdvanceCursorResult = {
  fresh: AmoEvent[];
  next: AmoEventCursor;
};

type BuildQueryParams = {
  from?: number;
  to?: number;
  types?: string[];
  entity?: string;
  entityIds?: Array<string | number>;
  createdBy?: number[];
};
