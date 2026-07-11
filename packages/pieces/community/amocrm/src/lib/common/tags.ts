import { HttpMethod } from '@activepieces/pieces-common';
import { Property, unique } from '@activepieces/pieces-framework';
import { AmocrmAuthProps, amoClient } from './client';

function normalizeEntityTags(embedded: unknown): EntityTag[] {
  if (!Array.isArray(embedded)) {
    return [];
  }
  return embedded.flatMap((tag) => {
    if (!isRecord(tag)) {
      return [];
    }
    const id = typeof tag['id'] === 'number' ? tag['id'] : undefined;
    const name = typeof tag['name'] === 'string' ? tag['name'] : undefined;
    return id === undefined && name === undefined ? [] : [{ id, name }];
  });
}

// amoCRM v4 has no delta tag endpoint — the full set is sent on every PATCH.
// Existing tags are preserved by id, freshly typed ones by name (deduped case-insensitively).
function mergeTags({ existing, incoming }: MergeTagsParams): TagRef[] {
  const existingNames = new Set(
    existing.flatMap((tag) => (tag.name === undefined ? [] : [tag.name.toLowerCase()])),
  );
  const newRefs = unique(incoming.map((name) => name.trim()).filter((name) => name !== ''))
    .filter((name) => !existingNames.has(name.toLowerCase()))
    .map((name) => ({ name }));
  return [...existing.flatMap(toRef), ...newRefs];
}

function removeTags({ existing, toRemove }: RemoveTagsParams): TagRef[] {
  const remove = new Set(
    toRemove.map((value) => value.trim().toLowerCase()).filter((value) => value !== ''),
  );
  return existing
    .filter(
      (tag) =>
        !(tag.name !== undefined && remove.has(tag.name.toLowerCase())) &&
        !(tag.id !== undefined && remove.has(String(tag.id))),
    )
    .flatMap(toRef);
}

function entityTypeProperty() {
  return Property.StaticDropdown({
    displayName: 'Linked Entity Type',
    required: true,
    options: {
      options: [
        { label: 'Lead', value: 'leads' },
        { label: 'Contact', value: 'contacts' },
        { label: 'Company', value: 'companies' },
      ],
    },
  });
}

// ponytail: read-modify-write, not atomic — two concurrent flow runs (or a flow + manual edit in
// amo) between GET and PATCH can clobber each other's tags; amoCRM v4 has no delta tag endpoint,
// so the only upgrade would be on amoCRM's side.
async function fetchEntityTags({ auth, entityType, entityId }: FetchTagsParams): Promise<EntityTag[]> {
  const response = await amoClient.makeRequest({
    auth,
    method: HttpMethod.GET,
    path: `/${entityType}/${entityId}`,
  });
  const embedded =
    isRecord(response) && isRecord(response['_embedded']) ? response['_embedded']['tags'] : undefined;
  return normalizeEntityTags(embedded);
}

async function patchTags({ auth, entityType, entityId, tags }: PatchTagsParams): Promise<unknown> {
  return await amoClient.makeRequest({
    auth,
    method: HttpMethod.PATCH,
    path: `/${entityType}/${entityId}`,
    body: { _embedded: { tags } },
  });
}

export const tagsUtils = {
  normalizeEntityTags,
  mergeTags,
  removeTags,
  entityTypeProperty,
  fetchEntityTags,
  patchTags,
};

function toRef(tag: EntityTag): TagRef[] {
  if (tag.id !== undefined) {
    return [{ id: tag.id }];
  }
  if (tag.name !== undefined) {
    return [{ name: tag.name }];
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export type TagRef = { id: number } | { name: string };

type EntityTag = { id?: number; name?: string };

type MergeTagsParams = {
  existing: EntityTag[];
  incoming: string[];
};

type RemoveTagsParams = {
  existing: EntityTag[];
  toRemove: string[];
};

type FetchTagsParams = {
  auth: AmocrmAuthProps;
  entityType: string;
  entityId: unknown;
};

type PatchTagsParams = FetchTagsParams & {
  tags: TagRef[];
};
