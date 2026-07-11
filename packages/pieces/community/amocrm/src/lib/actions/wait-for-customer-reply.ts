import { HttpMethod } from '@activepieces/pieces-common';
import {
  ExecutionType,
  createAction,
  isNil,
  tryCatch,
} from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { amoClient } from '../common';

export const waitForCustomerReply = createAction({
  auth: amocrmAuth,
  name: 'wait_for_customer_reply',
  displayName: 'Wait for Customer Reply',
  description:
    'Pauses the flow until a new incoming chat message is received in amoCRM.',
  aiMetadata: {
    description:
      'Pauses the flow and resumes when the next incoming chat message (amoJo/talks) arrives in amoCRM, returning the message payload. Requires a connected messaging channel. Not idempotent — each run registers a one-shot webhook subscription.',
    idempotent: false,
  },
  props: {},
  async run(context) {
    const auth = context.auth.props;
    const stateKey = `wait_for_customer_reply:${context.run.id}:${context.step.name}`;

    if (context.executionType === ExecutionType.BEGIN) {
      const waitpoint = await context.run.createWaitpoint({ type: 'WEBHOOK' });
      const resumeUrl = waitpoint.buildResumeUrl({ queryParams: {} });
      // ponytail: same account-wide caveat as wait_for_task_completed — amo message webhooks carry
      // no per-conversation filter, so the flow resumes on the FIRST incoming message in the account.
      // Precise per-contact resume would need trigger/DP-side wiring (out of scope). The subscription
      // is best-effort deleted on resume; a never-resumed flow leaves it registered in amo.
      await amoClient.makeRequest({
        auth,
        method: HttpMethod.POST,
        path: '/webhooks',
        body: { destination: resumeUrl, settings: ['add_message'] },
      });

      await context.store.put(stateKey, { resumeUrl });
      context.run.waitForWaitpoint(waitpoint.id);
      return { received: false };
    }

    const state = await context.store.get<WaitState>(stateKey);
    if (!isNil(state)) {
      await tryCatch(() =>
        amoClient.makeRequest({
          auth,
          method: HttpMethod.DELETE,
          path: '/webhooks',
          body: { destination: state.resumeUrl },
        }),
      );
      await context.store.delete(stateKey);
    }

    const message = extractMessage({ body: context.resumePayload.body });
    return { received: true, message };
  },
});

function extractMessage({ body }: { body: unknown }): unknown {
  let current: unknown = body;
  for (const segment of ['message', 'add']) {
    if (!isRecord(current)) {
      return null;
    }
    current = current[segment];
  }
  return Array.isArray(current) ? current[0] ?? null : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

type WaitState = {
  resumeUrl: string;
};
