import { HttpRequest, HttpResponse, httpClient } from '@activepieces/pieces-common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AmoEvent, amoEvents } from './events';

const AUTH = {
  subdomain: 'acme',
  zone: 'amocrm.ru',
  apiToken: 'token-123',
};

function resp(body: unknown): HttpResponse {
  return { status: 200, headers: {}, body };
}

function event({ id, createdAt }: { id: string; createdAt: number }): AmoEvent {
  return { id, created_at: createdAt, type: 'lead_added', entity_id: 1 };
}

let sendRequest: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  sendRequest = vi.spyOn(httpClient, 'sendRequest');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('amoEvents.advanceCursor', () => {
  it('dedups an already-seen event on the same-second boundary and advances', () => {
    const cursor = { lastCreatedAt: 100, lastIds: ['a'] };
    const events = [
      event({ id: 'a', createdAt: 100 }),
      event({ id: 'b', createdAt: 100 }),
      event({ id: 'c', createdAt: 105 }),
    ];

    const { fresh, next } = amoEvents.advanceCursor({ events, cursor });

    expect(fresh.map((e) => e.id)).toEqual(['b', 'c']);
    expect(next).toEqual({ lastCreatedAt: 105, lastIds: ['c'] });
  });

  it('keeps same-second ids together when they are the newest', () => {
    const cursor = { lastCreatedAt: 100, lastIds: [] };
    const events = [event({ id: 'x', createdAt: 200 }), event({ id: 'y', createdAt: 200 })];

    const { fresh, next } = amoEvents.advanceCursor({ events, cursor });

    expect(fresh.map((e) => e.id)).toEqual(['x', 'y']);
    expect(next).toEqual({ lastCreatedAt: 200, lastIds: ['x', 'y'] });
  });

  it('carries prior boundary ids so an emitted event is not re-emitted next round', () => {
    const cursor = { lastCreatedAt: 105, lastIds: ['e1'] };
    const events = [event({ id: 'e1', createdAt: 105 }), event({ id: 'e2', createdAt: 105 })];

    const { fresh, next } = amoEvents.advanceCursor({ events, cursor });

    expect(fresh.map((e) => e.id)).toEqual(['e2']);
    expect(next.lastCreatedAt).toBe(105);
    expect([...next.lastIds].sort()).toEqual(['e1', 'e2']);
  });

  it('returns an unchanged cursor on empty input', () => {
    const cursor = { lastCreatedAt: 100, lastIds: ['a'] };
    const { fresh, next } = amoEvents.advanceCursor({ events: [], cursor });
    expect(fresh).toEqual([]);
    expect(next).toBe(cursor);
  });

  it('drops events older than the cursor', () => {
    const cursor = { lastCreatedAt: 100, lastIds: [] };
    const events = [event({ id: 'old', createdAt: 99 }), event({ id: 'new', createdAt: 101 })];
    const { fresh } = amoEvents.advanceCursor({ events, cursor });
    expect(fresh.map((e) => e.id)).toEqual(['new']);
  });
});

describe('amoEvents.fetchEvents', () => {
  it('concatenates pages and stops when _links.next is absent', async () => {
    const pages: Record<string, unknown> = {
      '1': {
        _embedded: { events: [event({ id: 'a', createdAt: 10 }), event({ id: 'b', createdAt: 9 })] },
        _links: { next: { href: 'https://acme.amocrm.ru/api/v4/events?page=2' } },
      },
      '2': {
        _embedded: { events: [event({ id: 'c', createdAt: 8 })] },
        _links: {},
      },
    };
    sendRequest.mockImplementation(async (request: HttpRequest) => {
      const page = new URL(request.url).searchParams.get('page') ?? '1';
      return resp(pages[page]);
    });

    const events = await amoEvents.fetchEvents({ auth: AUTH, from: 5 });

    expect(events.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(sendRequest).toHaveBeenCalledTimes(2);
    const firstReq = sendRequest.mock.calls[0][0] as HttpRequest;
    const params = new URL(firstReq.url).searchParams;
    expect(params.get('filter[created_at][from]')).toBe('5');
    expect(params.get('limit')).toBe('100');
  });

  it('stops at the maxPages cap even when _links.next keeps pointing forward', async () => {
    sendRequest.mockImplementation(async (request: HttpRequest) => {
      const page = Number(new URL(request.url).searchParams.get('page') ?? '1');
      return resp({
        _embedded: { events: [event({ id: `e${page}`, createdAt: 100 - page })] },
        _links: { next: { href: 'https://acme.amocrm.ru/api/v4/events?page=next' } },
      });
    });

    const events = await amoEvents.fetchEvents({ auth: AUTH, maxPages: 2 });

    expect(events.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(sendRequest).toHaveBeenCalledTimes(2);
  });

  it('returns an empty array on an empty (204-style) response', async () => {
    sendRequest.mockResolvedValue(resp(''));
    const events = await amoEvents.fetchEvents({ auth: AUTH });
    expect(events).toEqual([]);
    expect(sendRequest).toHaveBeenCalledTimes(1);
  });

  it('appends array filters as repeated bracket params', async () => {
    sendRequest.mockResolvedValue(resp({ _embedded: { events: [] } }));
    await amoEvents.fetchEvents({
      auth: AUTH,
      types: ['lead_added', 'lead_status_changed'],
      entity: 'lead',
      entityIds: [42],
    });
    const req = sendRequest.mock.calls[0][0] as HttpRequest;
    const params = new URL(req.url).searchParams;
    expect(params.getAll('filter[type][]')).toEqual(['lead_added', 'lead_status_changed']);
    expect(params.get('filter[entity][]')).toBe('lead');
    expect(params.get('filter[entity_id][]')).toBe('42');
  });
});
