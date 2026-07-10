import { createAmoWebhookTrigger } from '../common/webhooks';
import { contactSample } from './contact-sample';

export const contactResponsibleChanged = createAmoWebhookTrigger({
  name: 'contact_responsible_changed',
  displayName: 'Contact Responsible User Changed',
  description: 'Triggers when the responsible user of a contact changes.',
  aiMetadata: {
    description: 'Fires when the responsible user assigned to a contact changes in amoCRM, emitting the full contact record.',
  },
  events: ['responsible_contact'],
  payloadPath: 'contacts.responsible',
  entityType: 'contacts',
  sampleData: contactSample,
});
