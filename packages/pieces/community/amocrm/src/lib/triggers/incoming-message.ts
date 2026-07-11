import { createAmoWebhookTrigger } from '../common/webhooks';

export const incomingMessage = createAmoWebhookTrigger({
  name: 'incoming_message',
  displayName: 'Incoming Message',
  description:
    'Triggers when a new chat message is received. Requires a connected chat channel (amoJo/talks); the messaging scope must be enabled on the account.',
  aiMetadata: {
    description:
      'Fires when a new message arrives in an amoCRM chat (amoJo/talks), emitting the raw message payload. Requires a connected messaging channel.',
  },
  events: ['add_message'],
  payloadPath: 'message.add',
  entityType: 'talks',
  fetchFullRecord: false,
  sampleData: {
    id: 'a1b2c3d4-0000-0000-0000-000000000000',
    chat_id: 'b790ec39-bc7c-43c8-8cd5-5f04779929fd',
    talk_id: 119,
    contact_id: 43297878,
    entity_id: null,
    entity_type: null,
    text: 'Hello, I have a question about my order.',
    type: 'incoming',
    origin: 'com.wazzup24-1',
    created_at: 1783728316,
  },
});
