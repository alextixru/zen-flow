import { HttpMethod } from '@activepieces/pieces-common';
import { DropdownOption, Property, isNil } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { AmocrmAuthProps, amoClient } from './client';

export const pipelineDropdown = ({ required }: DropdownFactoryParams) =>
  Property.Dropdown({
    auth: amocrmAuth,
    displayName: 'Pipeline',
    required,
    refreshers: [],
    options: async ({ auth }) => {
      if (isNil(auth)) {
        return disconnectedState();
      }
      const pipelines = await amoClient.fetchAllPages({
        auth: auth.props,
        path: '/leads/pipelines',
        embeddedKey: 'pipelines',
      });
      return { disabled: false, options: toOptions({ items: pipelines }) };
    },
  });

export const statusDropdown = ({ required }: DropdownFactoryParams) =>
  Property.Dropdown({
    auth: amocrmAuth,
    displayName: 'Status',
    required,
    refreshers: ['pipelineId'],
    options: async ({ auth, pipelineId }) => {
      if (isNil(auth) || (typeof pipelineId !== 'number' && typeof pipelineId !== 'string')) {
        return {
          disabled: true,
          placeholder: 'Select a pipeline first.',
          options: [],
        };
      }
      const statuses = await amoClient.fetchAllPages({
        auth: auth.props,
        path: `/leads/pipelines/${pipelineId}/statuses`,
        embeddedKey: 'statuses',
      });
      return { disabled: false, options: toOptions({ items: statuses }) };
    },
  });

export const userDropdown = ({ required }: DropdownFactoryParams) =>
  Property.Dropdown({
    auth: amocrmAuth,
    displayName: 'Responsible User',
    required,
    refreshers: [],
    options: async ({ auth }) => {
      if (isNil(auth)) {
        return disconnectedState();
      }
      const users = await amoClient.fetchAllPages({
        auth: auth.props,
        path: '/users',
        embeddedKey: 'users',
      });
      return {
        disabled: false,
        options: toOptions({
          items: users,
          labelOf: ({ item, name }) =>
            typeof item['email'] === 'string' ? `${name} (${item['email']})` : name,
        }),
      };
    },
  });

export const taskTypeDropdown = ({ required }: DropdownFactoryParams) =>
  Property.Dropdown({
    auth: amocrmAuth,
    displayName: 'Task Type',
    required,
    refreshers: [],
    options: async ({ auth }) => {
      if (isNil(auth)) {
        return disconnectedState();
      }
      const response = await amoClient.makeRequest({
        auth: auth.props,
        method: HttpMethod.GET,
        path: '/account?with=task_types',
      });
      const taskTypes = extractEmbedded({ response, key: 'task_types' });
      return { disabled: false, options: toOptions({ items: taskTypes }) };
    },
  });

export const tagDropdown = ({ entity, required }: TagDropdownParams) =>
  Property.Dropdown({
    auth: amocrmAuth,
    displayName: 'Tag',
    required,
    refreshers: [],
    options: async ({ auth }) => {
      if (isNil(auth)) {
        return disconnectedState();
      }
      const tags = await amoClient.fetchAllPages({
        auth: auth.props,
        path: `/${entity}/tags`,
        embeddedKey: 'tags',
      });
      return { disabled: false, options: toOptions({ items: tags }) };
    },
  });

export const lossReasonDropdown = () =>
  Property.Dropdown({
    auth: amocrmAuth,
    displayName: 'Loss Reason',
    required: false,
    refreshers: [],
    options: async ({ auth }) => {
      if (isNil(auth)) {
        return disconnectedState();
      }
      const reasons = await amoClient.fetchAllPages({
        auth: auth.props,
        path: '/leads/loss_reasons',
        embeddedKey: 'loss_reasons',
      });
      return { disabled: false, options: toOptions({ items: reasons }) };
    },
  });

export const leadDropdown = ({ required }: DropdownFactoryParams) =>
  entityDropdown({ entity: 'leads', displayName: 'Lead', required });

export const contactDropdown = ({ required }: DropdownFactoryParams) =>
  entityDropdown({ entity: 'contacts', displayName: 'Contact', required });

export const companyDropdown = ({ required }: DropdownFactoryParams) =>
  entityDropdown({ entity: 'companies', displayName: 'Company', required });

export const taskEntityDropdown = ({ required }: DropdownFactoryParams) =>
  entityByTypeDropdown({ displayName: 'Linked Entity', required, typeProp: 'entity_type' });

export const linkedEntityDropdown = ({ required, displayName, typeProp }: LinkedEntityDropdownParams) =>
  entityByTypeDropdown({ displayName, required, typeProp });

function entityByTypeDropdown({ displayName, required, typeProp }: EntityByTypeDropdownParams) {
  return Property.Dropdown({
    auth: amocrmAuth,
    displayName,
    required,
    refreshers: [typeProp],
    options: async (propsValue) => {
      const auth = propsValue['auth'];
      const entityType = propsValue[typeProp];
      if (isNil(auth)) {
        return disconnectedState();
      }
      if (entityType !== 'leads' && entityType !== 'contacts' && entityType !== 'companies') {
        return { disabled: true, placeholder: 'Select an entity type first.', options: [] };
      }
      return {
        disabled: false,
        options: await fetchEntityOptions({ auth: auth.props, entity: entityType }),
      };
    },
  });
}

function entityDropdown({ entity, displayName, required }: EntityDropdownParams) {
  return Property.Dropdown({
    auth: amocrmAuth,
    displayName,
    required,
    refreshers: [],
    options: async ({ auth }) => {
      if (isNil(auth)) {
        return disconnectedState();
      }
      return {
        disabled: false,
        options: await fetchEntityOptions({ auth: auth.props, entity }),
      };
    },
  });
}

// ponytail: 250 latest entities only — Property.Dropdown has no server-side search;
// pick older records by id via find_entity + manual input, upgrade is a searchable dropdown
async function fetchEntityOptions({ auth, entity }: FetchEntityOptionsParams) {
  const response = await amoClient.makeRequest({
    auth,
    method: HttpMethod.GET,
    path: `/${entity}?limit=250&order[updated_at]=desc`,
  });
  const items = extractEmbedded({ response, key: entity });
  return toOptions({ items, labelOf: ({ item, name }) => `${name} (${item['id']})` });
}

function disconnectedState() {
  return {
    disabled: true,
    placeholder: 'Please connect your amoCRM account first.',
    options: [],
  };
}

function toOptions({ items, labelOf }: ToOptionsParams): DropdownOption<number>[] {
  return items.flatMap((item) => {
    if (!isRecord(item) || typeof item['id'] !== 'number') {
      return [];
    }
    const name = typeof item['name'] === 'string' ? item['name'] : String(item['id']);
    return [{ label: labelOf ? labelOf({ item, name }) : name, value: item['id'] }];
  });
}

function extractEmbedded({ response, key }: { response: unknown; key: string }): unknown[] {
  if (!isRecord(response) || !isRecord(response['_embedded'])) {
    return [];
  }
  const embedded = response['_embedded'][key];
  return Array.isArray(embedded) ? embedded : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

type DropdownFactoryParams = {
  required: boolean;
};

type TagDropdownParams = {
  entity: 'leads' | 'contacts' | 'companies';
  required: boolean;
};

type EntityDropdownParams = {
  entity: 'leads' | 'contacts' | 'companies';
  displayName: string;
  required: boolean;
};

type EntityByTypeDropdownParams = {
  displayName: string;
  required: boolean;
  typeProp: string;
};

type LinkedEntityDropdownParams = {
  displayName: string;
  required: boolean;
  typeProp: string;
};

type FetchEntityOptionsParams = {
  auth: AmocrmAuthProps;
  entity: 'leads' | 'contacts' | 'companies';
};

type ToOptionsParams = {
  items: unknown[];
  labelOf?: (params: { item: Record<string, unknown>; name: string }) => string;
};
