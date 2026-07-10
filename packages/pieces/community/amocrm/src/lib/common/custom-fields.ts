import { InputProperty, Property, isNil } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { AmocrmAuthProps, amoClient } from './client';

function customFieldsProperty({ entity }: CustomFieldsPropertyParams) {
  return Property.DynamicProperties({
    auth: amocrmAuth,
    displayName: 'Custom Fields',
    required: false,
    refreshers: [],
    props: async ({ auth }) => {
      if (isNil(auth)) {
        return {};
      }
      const fieldsMeta = await fetchCustomFieldsMeta({ auth: auth.props, entity });
      return Object.fromEntries(
        fieldsMeta.map((field) => [String(field.id), toProperty({ field })]),
      );
    },
  });
}

async function fetchCustomFieldsMeta({
  auth,
  entity,
}: FetchCustomFieldsMetaParams): Promise<AmoCustomFieldMeta[]> {
  const raw = await amoClient.fetchAllPages({
    auth,
    path: `/${entity}/custom_fields`,
    embeddedKey: 'custom_fields',
  });
  return raw.flatMap((item) => {
    if (!isRecord(item) || typeof item['id'] !== 'number' || typeof item['type'] !== 'string') {
      return [];
    }
    return [
      {
        id: item['id'],
        type: item['type'],
        name: typeof item['name'] === 'string' ? item['name'] : String(item['id']),
        enums: Array.isArray(item['enums']) ? item['enums'].flatMap(parseEnum) : undefined,
      },
    ];
  });
}

function buildCustomFieldsValues({
  fieldsMeta,
  values,
}: BuildCustomFieldsValuesParams): AmoCustomFieldValue[] {
  return Object.entries(values).flatMap(([fieldId, value]) => {
    if (isEmptyValue(value)) {
      return [];
    }
    const field = fieldsMeta.find((meta) => String(meta.id) === fieldId);
    if (isNil(field)) {
      return [];
    }
    const apiValues = toApiValues({ field, value });
    return apiValues.length === 0 ? [] : [{ field_id: field.id, values: apiValues }];
  });
}

export const customFieldsUtils = {
  customFieldsProperty,
  fetchCustomFieldsMeta,
  buildCustomFieldsValues,
};

function toProperty({ field }: { field: AmoCustomFieldMeta }): InputProperty {
  const base = { displayName: field.name, required: false } as const;
  switch (field.type) {
    case 'textarea':
      return Property.LongText(base);
    case 'numeric':
    case 'monetary':
      return Property.Number(base);
    case 'select':
    case 'radiobutton':
      return Property.StaticDropdown({ ...base, options: { options: enumOptions({ field }) } });
    case 'multiselect':
      return Property.StaticMultiSelectDropdown({
        ...base,
        options: { options: enumOptions({ field }) },
      });
    case 'checkbox':
      return Property.Checkbox(base);
    case 'date':
    case 'date_time':
    case 'birthday':
      return Property.DateTime(base);
    // text, url, multitext and unknown amo types (e.g. tracking_data) are plain text inputs
    default:
      return Property.ShortText(base);
  }
}

function toApiValues({
  field,
  value,
}: {
  field: AmoCustomFieldMeta;
  value: unknown;
}): Record<string, unknown>[] {
  switch (field.type) {
    case 'select':
    case 'radiobutton':
      return toEnumIds({ value: [value] });
    case 'multiselect':
      return toEnumIds({ value: Array.isArray(value) ? value : [value] });
    case 'date':
    case 'date_time':
    case 'birthday': {
      const seconds = toUnixSeconds({ value });
      return isNil(seconds) ? [] : [{ value: seconds }];
    }
    case 'checkbox':
      return [{ value: Boolean(value) }];
    case 'multitext':
      return [{ value: String(value), enum_code: field.enums?.[0]?.value ?? 'WORK' }];
    default:
      return [{ value }];
  }
}

function toEnumIds({ value }: { value: unknown[] }): Record<string, unknown>[] {
  return value.flatMap((entry) => {
    const enumId = typeof entry === 'number' ? entry : Number(entry);
    return Number.isNaN(enumId) ? [] : [{ enum_id: enumId }];
  });
}

// amo stores dates as unix seconds; DateTime props supply ISO strings,
// a numeric value is assumed to be unix seconds already
function toUnixSeconds({ value }: { value: unknown }): number | undefined {
  if (typeof value === 'number') {
    return Math.floor(value);
  }
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? undefined : Math.floor(parsed / 1000);
}

function enumOptions({ field }: { field: AmoCustomFieldMeta }) {
  return (field.enums ?? []).map((entry) => ({ label: entry.value, value: entry.id }));
}

function parseEnum(entry: unknown): AmoCustomFieldEnum[] {
  if (!isRecord(entry) || typeof entry['id'] !== 'number' || typeof entry['value'] !== 'string') {
    return [];
  }
  return [{ id: entry['id'], value: entry['value'] }];
}

function isEmptyValue(value: unknown): boolean {
  return isNil(value) || value === '' || (Array.isArray(value) && value.length === 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export type AmoCustomFieldMeta = {
  id: number;
  type: string;
  name: string;
  enums?: AmoCustomFieldEnum[];
};

export type AmoCustomFieldValue = {
  field_id: number;
  values: Record<string, unknown>[];
};

type AmoCustomFieldEnum = {
  id: number;
  value: string;
};

type AmoCustomFieldsEntity = 'leads' | 'contacts' | 'companies';

type CustomFieldsPropertyParams = {
  entity: AmoCustomFieldsEntity;
};

type FetchCustomFieldsMetaParams = {
  auth: AmocrmAuthProps;
  entity: AmoCustomFieldsEntity;
};

type BuildCustomFieldsValuesParams = {
  fieldsMeta: AmoCustomFieldMeta[];
  values: Record<string, unknown>;
};
