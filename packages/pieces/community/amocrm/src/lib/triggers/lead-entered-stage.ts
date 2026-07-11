import { pipelineDropdown, statusDropdown } from '../common/props';
import { AmoEvent } from '../common/events';
import { createAmoDoorbellTrigger } from '../common/events-doorbell';

export const leadEnteredStage = createAmoDoorbellTrigger({
  name: 'lead_entered_stage',
  displayName: 'Lead Entered Stage',
  description:
    'Triggers only when a lead enters the selected pipeline stage, emitting the amo event with value_before (previous status) and value_after (new status). Unlike Lead Status Changed, which fires on any status move and returns the full lead, this fires only for the chosen status and gives you where the lead came from.',
  aiMetadata: {
    description:
      'Fires when a lead moves into a specific selected pipeline status in amoCRM, emitting the amo event with the previous and new status.',
  },
  webhookEvents: ['status_lead'],
  eventTypes: ['lead_status_changed'],
  props: {
    pipelineId: pipelineDropdown({ required: true }),
    statusId: statusDropdown({ required: true }),
  },
  filterEvent: (event, propsValue) => enteredSelectedStatus(event, propsValue['statusId']),
  sampleData: {
    id: '01kx88gvkrbxyagwtdfjc4wj18',
    type: 'lead_status_changed',
    entity_id: 36632537,
    entity_type: 'lead',
    created_by: 0,
    created_at: 1783762546,
    account_id: 32453394,
    value_after: [{ lead_status: { id: 77124942, pipeline_id: 9670378 } }],
    value_before: [{ lead_status: { id: 143, pipeline_id: 9670378 } }],
  },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function enteredSelectedStatus(event: AmoEvent, statusId: unknown): boolean {
  const valueAfter = event['value_after'];
  if (!Array.isArray(valueAfter)) {
    return false;
  }
  const first = valueAfter[0];
  if (!isRecord(first) || !isRecord(first['lead_status'])) {
    return false;
  }
  return String(first['lead_status']['id']) === String(statusId);
}
