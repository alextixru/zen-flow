import { createAmoWebhookTrigger } from '../common/webhooks';
import { contactSample } from './contact-sample';

export const contactAdded = createAmoWebhookTrigger({
  name: 'contact_added',
  displayName: 'Contact Added',
  description: 'Triggers when a new contact is created.',
  aiMetadata: {
    description: 'Fires when a new contact is created in amoCRM, emitting the full contact record.',
  },
  events: ['add_contact'],
  payloadPath: 'contacts.add',
  entityType: 'contacts',
  sampleData: contactSample,
});
