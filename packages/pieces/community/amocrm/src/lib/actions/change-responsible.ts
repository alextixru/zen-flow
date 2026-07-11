import { HttpMethod } from '@activepieces/pieces-common';
import { Property, createAction, isNil, unique } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { AmocrmAuthProps, amoClient, linkedEntityDropdown, userDropdown } from '../common';

const cascadeCheckbox = (displayName: string) =>
  Property.Checkbox({ displayName, required: false });

export const changeResponsible = createAction({
  auth: amocrmAuth,
  name: 'change_responsible',
  displayName: 'Change Responsible User',
  description:
    'Changes the responsible user of a lead, contact or company, optionally cascading the change to linked entities and open tasks.',
  aiMetadata: {
    description:
      'Changes the responsible user of an amoCRM lead, contact or company, with optional cascade to linked company, contacts, open/closed leads, open tasks and the parent entity. Can pick a random active user. Idempotent for a specific user; not idempotent with the random user option.',
    idempotent: false,
  },
  props: {
    entity_type: Property.StaticDropdown({
      displayName: 'Entity Type',
      required: true,
      options: {
        options: [
          { label: 'Lead', value: 'leads' },
          { label: 'Contact', value: 'contacts' },
          { label: 'Company', value: 'companies' },
        ],
      },
    }),
    entity_id: linkedEntityDropdown({ required: true, displayName: 'Entity', typeProp: 'entity_type' }),
    random_user: Property.Checkbox({
      displayName: 'Random Active User',
      description: 'Assign a randomly picked active account user instead of a specific one.',
      required: false,
    }),
    responsible_user_id: userDropdown({ required: false }),
    change_in_linked_company: cascadeCheckbox('Also Change in Linked Company'),
    change_in_linked_contacts: cascadeCheckbox('Also Change in Linked Contacts'),
    change_in_linked_open_leads: cascadeCheckbox('Also Change in Linked Open Leads'),
    change_in_linked_closed_leads: cascadeCheckbox('Also Change in Linked Closed Leads'),
    change_in_linked_open_tasks: cascadeCheckbox('Also Change in Open Tasks'),
    change_in_parent_entity: Property.Checkbox({
      displayName: 'Also Change in Parent Entity',
      description: 'For a lead — its main contact; for a contact — its company.',
      required: false,
    }),
  },
  async run(context) {
    const auth = context.auth.props;
    const values = context.propsValue;
    const entityType = values.entity_type;

    const responsibleUserId =
      values.random_user === true
        ? await pickRandomActiveUser({ auth })
        : values.responsible_user_id;
    if (isNil(responsibleUserId)) {
      throw new Error('Select a responsible user or enable the random active user option.');
    }

    const entity = await amoClient.makeRequest({
      auth,
      method: HttpMethod.PATCH,
      path: `/${entityType}/${values.entity_id}`,
      body: { responsible_user_id: responsibleUserId },
    });

    const wantsLinks =
      values.change_in_linked_company === true ||
      values.change_in_linked_contacts === true ||
      values.change_in_linked_open_leads === true ||
      values.change_in_linked_closed_leads === true ||
      values.change_in_parent_entity === true;
    const embedded = wantsLinks
      ? await fetchEmbeddedLinks({ auth, entityType, entityId: values.entity_id })
      : {};

    const parent = values.change_in_parent_entity === true ? resolveParent({ entityType, embedded }) : undefined;

    const companyIds = unique([
      ...(values.change_in_linked_company === true && entityType !== 'companies'
        ? embeddedIds({ embedded, key: 'companies' })
        : []),
      ...(parent?.collection === 'companies' ? [parent.id] : []),
    ]);
    const contactIds = unique([
      ...(values.change_in_linked_contacts === true && entityType !== 'contacts'
        ? embeddedIds({ embedded, key: 'contacts' })
        : []),
      ...(parent?.collection === 'contacts' ? [parent.id] : []),
    ]);
    const leadIds =
      entityType === 'leads'
        ? []
        : await selectLeadsByStatus({
            auth,
            linkedLeadIds: embeddedIds({ embedded, key: 'leads' }),
            openWanted: values.change_in_linked_open_leads === true,
            closedWanted: values.change_in_linked_closed_leads === true,
          });
    const taskIds =
      values.change_in_linked_open_tasks === true
        ? await fetchOpenTaskIds({ auth, entityType, entityId: values.entity_id })
        : [];

    await batchPatchResponsible({ auth, collection: 'companies', ids: companyIds, responsibleUserId });
    await batchPatchResponsible({ auth, collection: 'contacts', ids: contactIds, responsibleUserId });
    await batchPatchResponsible({ auth, collection: 'leads', ids: leadIds, responsibleUserId });
    await batchPatchResponsible({ auth, collection: 'tasks', ids: taskIds, responsibleUserId });

    return {
      entity,
      responsible_user_id: responsibleUserId,
      cascade: { companies: companyIds, contacts: contactIds, leads: leadIds, tasks: taskIds },
    };
  },
});

async function pickRandomActiveUser({ auth }: { auth: AmocrmAuthProps }): Promise<number> {
  const users = await amoClient.fetchAllPages({ auth, path: '/users', embeddedKey: 'users' });
  const activeIds = users.flatMap((user) => {
    if (!isRecord(user) || typeof user['id'] !== 'number' || !isRecord(user['rights'])) {
      return [];
    }
    return user['rights']['is_active'] === true ? [user['id']] : [];
  });
  if (activeIds.length === 0) {
    throw new Error('No active users found in the amoCRM account.');
  }
  return activeIds[Math.floor(Math.random() * activeIds.length)];
}

async function fetchEmbeddedLinks({ auth, entityType, entityId }: EntityRefParams): Promise<Record<string, unknown>> {
  const response = await amoClient.makeRequest({
    auth,
    method: HttpMethod.GET,
    path: `/${entityType}/${entityId}?with=${WITH_BY_TYPE[entityType]}`,
  });
  return isRecord(response) && isRecord(response['_embedded']) ? response['_embedded'] : {};
}

// Parent interpretation: a lead's parent is its main contact, a contact's parent is its
// company; a company has no parent in the amoCRM model.
function resolveParent({ entityType, embedded }: ResolveParentParams): ParentRef | undefined {
  if (entityType === 'leads') {
    const contacts = asRecords(embedded['contacts']);
    const main = contacts.find((contact) => contact['is_main'] === true) ?? contacts[0];
    return main && typeof main['id'] === 'number' ? { collection: 'contacts', id: main['id'] } : undefined;
  }
  if (entityType === 'contacts') {
    const companyId = embeddedIds({ embedded, key: 'companies' })[0];
    return companyId === undefined ? undefined : { collection: 'companies', id: companyId };
  }
  return undefined;
}

async function selectLeadsByStatus({ auth, linkedLeadIds, openWanted, closedWanted }: SelectLeadsParams): Promise<number[]> {
  if (linkedLeadIds.length === 0 || (!openWanted && !closedWanted)) {
    return [];
  }
  if (openWanted && closedWanted) {
    return linkedLeadIds;
  }
  const selected = await Promise.all(
    chunkIds(linkedLeadIds).map(async (ids) => {
      const query = ids.map((id) => `filter[id][]=${id}`).join('&');
      const response = await amoClient.makeRequest({
        auth,
        method: HttpMethod.GET,
        path: `/leads?${query}&limit=${BATCH_SIZE}`,
      });
      return asRecords(isRecord(response) && isRecord(response['_embedded']) ? response['_embedded']['leads'] : undefined)
        .filter((lead) => {
          const closed = typeof lead['status_id'] === 'number' && CLOSED_STATUS_IDS.includes(lead['status_id']);
          return closed ? closedWanted : openWanted;
        })
        .flatMap((lead) => (typeof lead['id'] === 'number' ? [lead['id']] : []));
    }),
  );
  return selected.flat();
}

async function fetchOpenTaskIds({ auth, entityType, entityId }: EntityRefParams): Promise<number[]> {
  const tasks = await amoClient.fetchAllPages({
    auth,
    path: `/tasks?filter[entity_type]=${entityType}&filter[entity_id]=${entityId}&filter[is_completed]=0`,
    embeddedKey: 'tasks',
  });
  return tasks.flatMap((task) => (isRecord(task) && typeof task['id'] === 'number' ? [task['id']] : []));
}

async function batchPatchResponsible({ auth, collection, ids, responsibleUserId }: BatchPatchParams): Promise<void> {
  for (const batch of chunkIds(ids)) {
    await amoClient.makeRequest({
      auth,
      method: HttpMethod.PATCH,
      path: `/${collection}`,
      body: batch.map((id) => ({ id, responsible_user_id: responsibleUserId })),
    });
  }
}

function embeddedIds({ embedded, key }: { embedded: Record<string, unknown>; key: string }): number[] {
  return asRecords(embedded[key]).flatMap((item) => (typeof item['id'] === 'number' ? [item['id']] : []));
}

function chunkIds(ids: number[]): number[][] {
  return ids.length === 0
    ? []
    : Array.from({ length: Math.ceil(ids.length / BATCH_SIZE) }, (_, index) =>
        ids.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
      );
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const BATCH_SIZE = 250;
// amoCRM system statuses: 142 = closed won, 143 = closed lost
const CLOSED_STATUS_IDS = [142, 143];
const WITH_BY_TYPE: Record<string, string> = {
  leads: 'contacts,companies',
  contacts: 'leads,companies',
  companies: 'leads,contacts',
};

type EntityRefParams = {
  auth: AmocrmAuthProps;
  entityType: string;
  entityId: unknown;
};

type ResolveParentParams = {
  entityType: string;
  embedded: Record<string, unknown>;
};

type ParentRef = {
  collection: 'contacts' | 'companies';
  id: number;
};

type SelectLeadsParams = {
  auth: AmocrmAuthProps;
  linkedLeadIds: number[];
  openWanted: boolean;
  closedWanted: boolean;
};

type BatchPatchParams = {
  auth: AmocrmAuthProps;
  collection: 'leads' | 'contacts' | 'companies' | 'tasks';
  ids: number[];
  responsibleUserId: number;
};
