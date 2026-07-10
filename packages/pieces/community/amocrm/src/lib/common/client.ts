import { HttpError, HttpMethod, httpClient } from '@activepieces/pieces-common';
import { tryCatch } from '@activepieces/pieces-framework';

async function makeRequest({ auth, method, path, body }: MakeRequestParams): Promise<unknown> {
  const { data, error } = await tryCatch(() =>
    httpClient.sendRequest({
      method,
      url: `https://${auth.subdomain}.${auth.zone}/api/v4${path}`,
      headers: {
        Authorization: `Bearer ${auth.apiToken}`,
        'Content-Type': 'application/json',
      },
      body,
    }),
  );

  if (error) {
    throw toReadableError(error);
  }

  return data.body;
}

async function fetchAllPages({
  auth,
  path,
  embeddedKey,
  limit,
}: FetchAllPagesParams): Promise<unknown[]> {
  const pageLimit = limit ?? MAX_PAGE_LIMIT;
  const separator = path.includes('?') ? '&' : '?';
  let items: unknown[] = [];

  // ponytail: hard page cap guards against a looping _links.next from the API
  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await makeRequest({
      auth,
      method: HttpMethod.GET,
      path: `${path}${separator}page=${page}&limit=${pageLimit}`,
    });

    if (!isRecord(response)) {
      break;
    }

    const embedded = isRecord(response['_embedded'])
      ? response['_embedded'][embeddedKey]
      : undefined;
    if (!Array.isArray(embedded) || embedded.length === 0) {
      break;
    }

    items = items.concat(embedded);

    const links = response['_links'];
    if (!isRecord(links) || !isRecord(links['next'])) {
      break;
    }
  }

  return items;
}

function toReadableError(error: Error): Error {
  if (error instanceof HttpError) {
    // amo returns { detail, status, validation-errors } — surface it so the user sees the cause
    return new Error(
      `amoCRM API error (${error.response.status}): ${JSON.stringify(error.response.body)}`,
    );
  }
  return error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const amoClient = {
  makeRequest,
  fetchAllPages,
};

const MAX_PAGES = 100;
const MAX_PAGE_LIMIT = 250;

export type AmocrmAuthProps = {
  subdomain: string;
  zone: string;
  apiToken: string;
};

type MakeRequestParams = {
  auth: AmocrmAuthProps;
  method: HttpMethod;
  path: string;
  body?: unknown;
};

type FetchAllPagesParams = {
  auth: AmocrmAuthProps;
  path: string;
  embeddedKey: string;
  limit?: number;
};
