import { userDropdown } from '../common/props';
import { AmoEvent } from '../common/events';
import { createAmoEventsPollingTrigger } from '../common/events-polling';

export const outgoingCall = createAmoEventsPollingTrigger({
  name: 'outgoing_call',
  displayName: 'Outgoing Call',
  description:
    'Triggers on each outgoing call registered in amoCRM. Requires a connected telephony integration. Polls the events feed once a minute, so expect up to a minute of delay. Optionally filter by the manager who placed the call.',
  aiMetadata: {
    description:
      'Fires when an outgoing call is registered in amoCRM (telephony must be connected).',
  },
  types: ['outgoing_call'],
  props: {
    created_by: userDropdown({ required: false, displayName: 'Manager' }),
  },
  filterEvent: (event, propsValue) => matchesManager(event, propsValue['created_by']),
  // ponytail: best-guess payload from amoCRM docs — stand has no telephony (feed returned 204),
  // so this sampleData is NOT verified against a live call event.
  sampleData: {
    id: '01kx87t000000000000000001',
    type: 'outgoing_call',
    entity_id: 36632537,
    entity_type: 'lead',
    created_by: 0,
    created_at: 1783761803,
    account_id: 32453394,
    value_after: [
      {
        note: {
          id: 123457,
          note_type: 'call_out',
          params: { uniq: 'abc-124', duration: 30, phone: '+79990000000' },
        },
      },
    ],
  },
});

function matchesManager(event: AmoEvent, createdBy: unknown): boolean {
  if (createdBy === undefined || createdBy === null || createdBy === '') {
    return true;
  }
  return String(event['created_by']) === String(createdBy);
}
