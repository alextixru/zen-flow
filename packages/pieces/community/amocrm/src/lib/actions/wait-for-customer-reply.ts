import {
  ExecutionType,
  Property,
  createAction,
  isNil,
} from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import {
  amoEvents,
  linkedEntityDropdown,
  waitCycle,
  waitCycleProps,
} from '../common';

export const waitForCustomerReply = createAction({
  auth: amocrmAuth,
  name: 'wait_for_customer_reply',
  displayName: 'Wait for Customer Reply',
  description:
    'Pauses the flow until a new incoming chat message is received in amoCRM.',
  aiMetadata: {
    description:
      'Pauses the flow and re-checks every few minutes until the next incoming chat message (amoJo/talks) arrives in amoCRM, returning the message payload. Optionally scope the wait to a single lead or contact. Requires a connected messaging channel. Not idempotent.',
    idempotent: false,
  },
  props: {
    entity_type: Property.StaticDropdown({
      displayName: 'Watched Entity Type',
      description:
        'Optional. Wait only for a reply on a specific lead or contact. Leave empty to resume on the first incoming message anywhere in the account.',
      required: false,
      options: {
        options: [
          { label: 'Lead', value: 'leads' },
          { label: 'Contact', value: 'contacts' },
        ],
      },
    }),
    entity_id: linkedEntityDropdown({
      displayName: 'Watched Entity',
      required: false,
      typeProp: 'entity_type',
    }),
    ...waitCycleProps,
  },
  async run(context) {
    const auth = context.auth.props;
    const stateKey = `wait_for_customer_reply:${context.run.id}:${context.step.name}`;
    const values = context.propsValue;
    const intervalMinutes = values.check_interval_minutes ?? DEFAULT_CHECK_INTERVAL_MINUTES;

    if (context.executionType === ExecutionType.BEGIN) {
      const nowSec = waitCycle.nowSeconds();
      const entity = ENTITY_FILTER[values.entity_type ?? ''];
      const deadline = waitCycle.computeDeadline({
        nowSec,
        timeoutHours: values.timeout_hours ?? DEFAULT_TIMEOUT_HOURS,
      });
      await context.store.put<WaitState>(stateKey, {
        startedAt: nowSec,
        deadline,
        entity,
        entityId: values.entity_id,
      });

      const waitpoint = await context.run.createWaitpoint({
        type: 'DELAY',
        resumeDateTime: waitCycle.nextResumeDateTime({ intervalMinutes }),
      });
      context.run.waitForWaitpoint(waitpoint.id);
      return { received: false };
    }

    const state = await context.store.get<WaitState>(stateKey);
    if (isNil(state)) {
      return { received: false };
    }

    const events = await amoEvents.fetchEvents({
      auth,
      from: state.startedAt,
      types: ['incoming_chat_message'],
      entity: state.entity,
      entityIds: isNil(state.entityId) ? undefined : [state.entityId],
      maxPages: 1,
    });

    if (events.length > 0) {
      await context.store.delete(stateKey);
      return { received: true, message: extractMessage({ event: events[0] }) };
    }

    if (waitCycle.isTimedOut({ nowSec: waitCycle.nowSeconds(), deadline: state.deadline })) {
      await context.store.delete(stateKey);
      return { received: false, timed_out: true };
    }

    const waitpoint = await context.run.createWaitpoint({
      type: 'DELAY',
      resumeDateTime: waitCycle.nextResumeDateTime({ intervalMinutes }),
    });
    context.run.waitForWaitpoint(waitpoint.id);
    return { received: false };
  },
});

function extractMessage({ event }: { event: Record<string, unknown> }): unknown {
  const valueAfter = event['value_after'];
  const first = Array.isArray(valueAfter) ? valueAfter[0] : undefined;
  if (isRecord(first) && isRecord(first['message'])) {
    return first['message'];
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// leads/contacts (dropdown values) map to the singular entity_type used by /events
const ENTITY_FILTER: Record<string, string | undefined> = {
  leads: 'lead',
  contacts: 'contact',
  '': undefined,
};

const DEFAULT_CHECK_INTERVAL_MINUTES = 5;
const DEFAULT_TIMEOUT_HOURS = 24;

type WaitState = {
  startedAt: number;
  deadline: number;
  entity: string | undefined;
  entityId: string | number | undefined;
};
