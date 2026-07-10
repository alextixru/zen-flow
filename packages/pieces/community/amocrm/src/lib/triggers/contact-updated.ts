import { createAmoWebhookTrigger } from '../common/webhooks';
import { contactSample } from './contact-sample';

export const contactUpdated = createAmoWebhookTrigger({
  name: 'contact_updated',
  displayName: 'Contact Updated',
  description: 'Triggers when a contact is updated.',
  aiMetadata: {
    description: 'Fires when a contact is updated in amoCRM, emitting the full contact record.',
  },
  events: ['update_contact'],
  payloadPath: 'contacts.update',
  entityType: 'contacts',
  sampleData: contactSample,
});
