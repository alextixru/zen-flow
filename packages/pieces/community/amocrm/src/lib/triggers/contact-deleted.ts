import { createAmoWebhookTrigger } from '../common/webhooks';

export const contactDeleted = createAmoWebhookTrigger({
  name: 'contact_deleted',
  displayName: 'Contact Deleted',
  description: 'Triggers when a contact is deleted.',
  aiMetadata: {
    description: 'Fires when a contact is deleted in amoCRM, emitting the deletion payload (the contact no longer exists to fetch).',
  },
  events: ['delete_contact'],
  payloadPath: 'contacts.delete',
  entityType: 'contacts',
  fetchFullRecord: false,
  sampleData: {
    id: 40401635,
  },
});
