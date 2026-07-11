import { HttpMethod } from '@activepieces/pieces-common';
import { Property, createAction } from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { amoClient, taskEntityDropdown } from '../common';

// ponytail: file-attachment notes deferred — amo Files API is a multi-step session upload to a
// separate drive host (create session -> PUT parts -> file_uuid -> attachment note), too heavy for
// this iteration and unverified on the dev stand. Add create_note_with_file when Files API is scoped.
export const createNote = createAction({
  auth: amocrmAuth,
  name: 'create_note',
  displayName: 'Create Note',
  description: 'Adds a note to a lead, contact or company in amoCRM.',
  aiMetadata: {
    description:
      'Adds a note (common, service message or call log) with text to a lead, contact or company in amoCRM. Not idempotent — each call creates a separate note.',
    idempotent: false,
  },
  props: {
    entity_type: Property.StaticDropdown({
      displayName: 'Linked Entity Type',
      required: true,
      options: {
        options: [
          { label: 'Lead', value: 'leads' },
          { label: 'Contact', value: 'contacts' },
          { label: 'Company', value: 'companies' },
        ],
      },
    }),
    entity_id: taskEntityDropdown({ required: true }),
    note_type: Property.StaticDropdown({
      displayName: 'Note Type',
      required: true,
      defaultValue: 'common',
      options: {
        options: [
          { label: 'Common', value: 'common' },
          { label: 'Service Message', value: 'service_message' },
          { label: 'Incoming Call', value: 'call_in' },
          { label: 'Outgoing Call', value: 'call_out' },
        ],
      },
    }),
    text: Property.LongText({ displayName: 'Note Text', required: true }),
  },
  async run(context) {
    const auth = context.auth.props;
    const { entity_type, entity_id, note_type, text } = context.propsValue;
    const response = await amoClient.makeRequest({
      auth,
      method: HttpMethod.POST,
      path: `/${entity_type}/${entity_id}/notes`,
      body: [{ note_type, params: { text } }],
    });
    return firstCreatedNote({ response }) ?? response;
  },
});

function firstCreatedNote({ response }: { response: unknown }): unknown {
  if (!isRecord(response) || !isRecord(response['_embedded'])) {
    return undefined;
  }
  const notes = response['_embedded']['notes'];
  return Array.isArray(notes) ? notes[0] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
