import { Property, isNil, spreadIfDefined } from '@activepieces/pieces-framework';
import {
  AmocrmAuthProps,
  companyDropdown,
  contactDropdown,
  customFieldsUtils,
  pipelineDropdown,
  statusDropdown,
  userDropdown,
} from '../common';

function optionalProps() {
  return {
    price: Property.Number({ displayName: 'Price', required: false }),
    pipelineId: pipelineDropdown({ required: false }),
    statusId: statusDropdown({ required: false }),
    responsible_user_id: userDropdown({ required: false }),
    tags: Property.Array({ displayName: 'Tags', required: false }),
    contact_id: contactDropdown({ required: false }),
    company_id: companyDropdown({ required: false }),
    custom_fields: customFieldsUtils.customFieldsProperty({ entity: 'leads' }),
  };
}

// PATCH would overwrite fields with empty values, so unset props are omitted entirely
async function buildBody({ auth, values }: BuildBodyParams): Promise<Record<string, unknown>> {
  const customFieldsValues = await resolveCustomFieldsValues({ auth, values });
  const embedded = buildEmbedded({ values });
  return {
    ...spreadIfDefined('name', values.name),
    ...spreadIfDefined('price', values.price),
    ...spreadIfDefined('pipeline_id', values.pipelineId),
    ...spreadIfDefined('status_id', values.statusId),
    ...spreadIfDefined('responsible_user_id', values.responsible_user_id),
    ...(customFieldsValues.length > 0 ? { custom_fields_values: customFieldsValues } : {}),
    ...(Object.keys(embedded).length > 0 ? { _embedded: embedded } : {}),
  };
}

export const leadPayload = {
  optionalProps,
  buildBody,
};

async function resolveCustomFieldsValues({ auth, values }: BuildBodyParams) {
  const customFields = values.custom_fields ?? {};
  if (Object.keys(customFields).length === 0) {
    return [];
  }
  const fieldsMeta = await customFieldsUtils.fetchCustomFieldsMeta({ auth, entity: 'leads' });
  return customFieldsUtils.buildCustomFieldsValues({ fieldsMeta, values: customFields });
}

function buildEmbedded({ values }: { values: LeadPropsValues }): Record<string, unknown> {
  const tags = (values.tags ?? []).flatMap((tag) =>
    isNil(tag) || tag === '' ? [] : [{ name: String(tag) }],
  );
  return {
    ...(tags.length > 0 ? { tags } : {}),
    ...(isNil(values.contact_id) ? {} : { contacts: [{ id: values.contact_id }] }),
    ...(isNil(values.company_id) ? {} : { companies: [{ id: values.company_id }] }),
  };
}

type LeadPropsValues = {
  name?: string;
  price?: number;
  pipelineId?: number;
  statusId?: number;
  responsible_user_id?: number;
  tags?: unknown[];
  contact_id?: number;
  company_id?: number;
  custom_fields?: Record<string, unknown>;
};

type BuildBodyParams = {
  auth: AmocrmAuthProps;
  values: LeadPropsValues;
};
