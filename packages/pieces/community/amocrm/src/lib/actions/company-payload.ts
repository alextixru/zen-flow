import { Property, isNil, spreadIfDefined } from '@activepieces/pieces-framework';
import { AmocrmAuthProps, customFieldsUtils, userDropdown } from '../common';

function optionalProps() {
  return {
    responsible_user_id: userDropdown({ required: false }),
    tags: Property.Array({ displayName: 'Tags', required: false }),
    custom_fields: customFieldsUtils.customFieldsProperty({ entity: 'companies' }),
  };
}

// PATCH would overwrite fields with empty values, so unset props are omitted entirely
async function buildBody({ auth, values }: BuildBodyParams): Promise<Record<string, unknown>> {
  const customFieldsValues = await resolveCustomFieldsValues({ auth, values });
  const embedded = buildEmbedded({ values });
  return {
    ...spreadIfDefined('name', values.name),
    ...spreadIfDefined('responsible_user_id', values.responsible_user_id),
    ...(customFieldsValues.length > 0 ? { custom_fields_values: customFieldsValues } : {}),
    ...(Object.keys(embedded).length > 0 ? { _embedded: embedded } : {}),
  };
}

export const companyPayload = {
  optionalProps,
  buildBody,
};

async function resolveCustomFieldsValues({ auth, values }: BuildBodyParams) {
  const customFields = values.custom_fields ?? {};
  if (Object.keys(customFields).length === 0) {
    return [];
  }
  const fieldsMeta = await customFieldsUtils.fetchCustomFieldsMeta({ auth, entity: 'companies' });
  return customFieldsUtils.buildCustomFieldsValues({ fieldsMeta, values: customFields });
}

function buildEmbedded({ values }: { values: CompanyPropsValues }): Record<string, unknown> {
  const tags = (values.tags ?? []).flatMap((tag) =>
    isNil(tag) || tag === '' ? [] : [{ name: String(tag) }],
  );
  return {
    ...(tags.length > 0 ? { tags } : {}),
  };
}

type CompanyPropsValues = {
  name?: string;
  responsible_user_id?: number;
  tags?: unknown[];
  custom_fields?: Record<string, unknown>;
};

type BuildBodyParams = {
  auth: AmocrmAuthProps;
  values: CompanyPropsValues;
};
