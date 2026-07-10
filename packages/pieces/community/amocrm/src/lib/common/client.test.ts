import {
  HttpError,
  HttpMethod,
  HttpRequest,
  HttpResponse,
  httpClient,
} from '@activepieces/pieces-common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { amoClient } from './client';

const AUTH = {
  subdomain: 'acme',
  zone: 'amocrm.ru',
  apiToken: 'token-123',
};

function resp(body: unknown): HttpResponse {
  return { status: 200, headers: {}, body };
}

let sendRequest: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  sendRequest = vi.spyOn(httpClient, 'sendRequest');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('amoClient.makeRequest', () => {
  it('builds the URL from subdomain/zone and sends the bearer header', async () => {
    sendRequest.mockResolvedValue(resp({ id: 1 }));

    const body = await amoClient.makeRequest({
      auth: AUTH,
      method: HttpMethod.GET,
      path: '/account',
    });

    expect(body).toEqual({ id: 1 });
    const req = sendRequest.mock.calls[0][0] as HttpRequest;
    expect(req.url).toBe('https://acme.amocrm.ru/api/v4/account');
    expect(req.headers?.['Authorization']).toBe('Bearer token-123');
    expect(req.headers?.['Content-Type']).toBe('application/json');
  });

  it('rethrows amo API errors with status and response body', async () => {
    sendRequest.mockRejectedValue(
      new HttpError(undefined, {
        status: 400,
        responseBody: { detail: 'Bad request', status: 400 },
      }),
    );

    await expect(
      amoClient.makeRequest({ auth: AUTH, method: HttpMethod.GET, path: '/leads' }),
    ).rejects.toThrow('amoCRM API error (400): {"detail":"Bad request","status":400}');
  });
});

describe('amoClient.fetchAllPages', () => {
  it('concatenates pages and stops when _links.next is absent', async () => {
    const pages: Record<string, unknown> = {
      '1': {
        _embedded: { leads: [{ id: 1 }, { id: 2 }] },
        _links: { next: { href: 'https://acme.amocrm.ru/api/v4/leads?page=2' } },
      },
      '2': {
        _embedded: { leads: [{ id: 3 }] },
        _links: {},
      },
    };
    sendRequest.mockImplementation(async (request: HttpRequest) => {
      const page = new URL(request.url).searchParams.get('page') ?? '1';
      return resp(pages[page]);
    });

    const all = await amoClient.fetchAllPages({
      auth: AUTH,
      path: '/leads',
      embeddedKey: 'leads',
    });

    expect(all).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(sendRequest).toHaveBeenCalledTimes(2);
    const firstReq = sendRequest.mock.calls[0][0] as HttpRequest;
    expect(firstReq.url).toContain('page=1');
    expect(firstReq.url).toContain('limit=250');
  });

  it('returns the accumulated items on an empty (204-style) response', async () => {
    sendRequest.mockResolvedValue(resp(''));

    const all = await amoClient.fetchAllPages({
      auth: AUTH,
      path: '/contacts',
      embeddedKey: 'contacts',
    });

    expect(all).toEqual([]);
    expect(sendRequest).toHaveBeenCalledTimes(1);
  });
});
