import { describe, expect, it } from 'vitest';
import { AmoCustomFieldMeta, customFieldsUtils } from './custom-fields';

const { buildCustomFieldsValues } = customFieldsUtils;

const fieldsMeta: AmoCustomFieldMeta[] = [
  { id: 1, type: 'text', name: 'Position' },
  { id: 2, type: 'numeric', name: 'Guests' },
  {
    id: 3,
    type: 'select',
    name: 'Format',
    enums: [
      { id: 100, value: 'Wedding' },
      { id: 101, value: 'Birthday' },
    ],
  },
  {
    id: 4,
    type: 'multiselect',
    name: 'Venue',
    enums: [
      { id: 200, value: 'Hall A' },
      { id: 201, value: 'Hall B' },
    ],
  },
  { id: 5, type: 'date', name: 'Due Date' },
  { id: 6, type: 'checkbox', name: 'Confirmed' },
  {
    id: 7,
    type: 'multitext',
    name: 'Phone',
    enums: [
      { id: 300, value: 'MOB' },
      { id: 301, value: 'WORK' },
    ],
  },
  { id: 8, type: 'multitext', name: 'Messenger' },
];

describe('buildCustomFieldsValues', () => {
  it('maps text and numeric values as plain { value }', () => {
    expect(buildCustomFieldsValues({ fieldsMeta, values: { '1': 'CEO', '2': 12 } })).toEqual([
      { field_id: 1, values: [{ value: 'CEO' }] },
      { field_id: 2, values: [{ value: 12 }] },
    ]);
  });

  it('maps select to enum_id', () => {
    expect(buildCustomFieldsValues({ fieldsMeta, values: { '3': 101 } })).toEqual([
      { field_id: 3, values: [{ enum_id: 101 }] },
    ]);
  });

  it('maps multiselect to an enum_id per selection', () => {
    expect(buildCustomFieldsValues({ fieldsMeta, values: { '4': [200, 201] } })).toEqual([
      { field_id: 4, values: [{ enum_id: 200 }, { enum_id: 201 }] },
    ]);
  });

  it('converts ISO dates to unix seconds and passes numbers through as seconds', () => {
    expect(
      buildCustomFieldsValues({ fieldsMeta, values: { '5': '2026-07-10T12:00:00.000Z' } }),
    ).toEqual([{ field_id: 5, values: [{ value: 1783684800 }] }]);
    expect(buildCustomFieldsValues({ fieldsMeta, values: { '5': 1783684800 } })).toEqual([
      { field_id: 5, values: [{ value: 1783684800 }] },
    ]);
  });

  it('drops unparsable dates instead of sending NaN', () => {
    expect(buildCustomFieldsValues({ fieldsMeta, values: { '5': 'not a date' } })).toEqual([]);
  });

  it('maps checkbox to a boolean value', () => {
    expect(buildCustomFieldsValues({ fieldsMeta, values: { '6': true } })).toEqual([
      { field_id: 6, values: [{ value: true }] },
    ]);
  });

  it('maps multitext with the first enum code, falling back to WORK', () => {
    expect(buildCustomFieldsValues({ fieldsMeta, values: { '7': '+79990000000' } })).toEqual([
      { field_id: 7, values: [{ value: '+79990000000', enum_code: 'MOB' }] },
    ]);
    expect(buildCustomFieldsValues({ fieldsMeta, values: { '8': '@user' } })).toEqual([
      { field_id: 8, values: [{ value: '@user', enum_code: 'WORK' }] },
    ]);
  });

  it('skips empty values and unknown field ids', () => {
    expect(
      buildCustomFieldsValues({
        fieldsMeta,
        values: { '1': '', '2': undefined, '4': [], '999': 'ghost' },
      }),
    ).toEqual([]);
  });

  it('returns an empty array for no values', () => {
    expect(buildCustomFieldsValues({ fieldsMeta, values: {} })).toEqual([]);
  });
});
