import { HttpMethod } from '@activepieces/pieces-common';
import {
  Property,
  createAction,
  isNil,
  spreadIfDefined,
  tryCatch,
} from '@activepieces/pieces-framework';
import { amocrmAuth } from '../auth';
import { AmocrmAuthProps, amoClient, leadDropdown, pipelineDropdown, statusDropdown } from '../common';

export const copyLead = createAction({
  auth: amocrmAuth,
  name: 'copy_lead',
  displayName: 'Copy Lead',
  description: 'Clones an existing lead with its fields, tags and links, optionally copying its notes and tasks.',
  aiMetadata: {
    description:
      'Clones a source lead into a new lead, carrying over name, price, custom fields, tags and linked contacts/companies, optionally its notes and tasks. Not idempotent — each call creates a separate lead.',
    idempotent: false,
  },
  props: {
    source_lead_id: leadDropdown({ required: true }),
    new_name: Property.ShortText({ displayName: 'New Lead Name', required: false }),
    pipelineId: pipelineDropdown({ required: false }),
    statusId: statusDropdown({ required: false }),
    copy_notes: Property.Checkbox({ displayName: 'Copy Notes', required: false }),
    copy_tasks: Property.Checkbox({ displayName: 'Copy Tasks', required: false }),
  },
  async run(context) {
    const auth = context.auth.props;
    const { source_lead_id, new_name, pipelineId, statusId, copy_notes, copy_tasks } =
      context.propsValue;

    const source = await amoClient.makeRequest({
      auth,
      method: HttpMethod.GET,
      path: `/leads/${source_lead_id}?with=contacts,companies,catalog_elements`,
    });
    if (!isRecord(source)) {
      throw new Error(`Source lead ${source_lead_id} not found.`);
    }

    const sourcePipelineId = readNumber(source, 'pipeline_id');
    const targetPipelineId = pipelineId ?? sourcePipelineId;
    const statuses = isNil(statusId) ? await fetchStatuses({ auth, pipelineId: targetPipelineId }) : [];
    const resolvedStatusId = resolveTargetStatusId({
      sourcePipelineId,
      sourceStatusId: readNumber(source, 'status_id'),
      targetPipelineId,
      targetStatusId: statusId,
      statuses,
    });

    const body = buildCopyBody({ source, newName: new_name, targetPipelineId, resolvedStatusId });
    const response = await amoClient.makeRequest({
      auth,
      method: HttpMethod.POST,
      path: '/leads',
      body: [body],
    });
    const created = firstCreatedLead({ response }) ?? response;

    const newId = isRecord(created) ? readNumber(created, 'id') : undefined;
    if (!isNil(newId)) {
      if (copy_notes) {
        await copyNotes({ auth, sourceId: Number(source_lead_id), targetId: newId });
      }
      if (copy_tasks) {
        await copyTasks({ auth, sourceId: Number(source_lead_id), targetId: newId });
      }
    }

    return created;
  },
});

function resolveTargetStatusId({
  sourcePipelineId,
  sourceStatusId,
  targetPipelineId,
  targetStatusId,
  statuses,
}: ResolveStatusParams): number | undefined {
  if (!isNil(targetStatusId)) {
    return targetStatusId;
  }
  const samePipeline = targetPipelineId === sourcePipelineId;
  // Triggeron CopyLead skips the unsorted ("Неразобранное") status — keep the source status only when it is a real stage
  if (samePipeline && !isNil(sourceStatusId) && !isUnsortedStatus({ statusId: sourceStatusId, statuses })) {
    return sourceStatusId;
  }
  return firstNormalStatusId({ statuses });
}

function buildCopyBody({
  source,
  newName,
  targetPipelineId,
  resolvedStatusId,
}: BuildCopyBodyParams): Record<string, unknown> {
  const embedded = buildEmbedded({ source });
  const customFieldsValues = source['custom_fields_values'];
  return {
    name: newName ?? readString(source, 'name') ?? 'Copy',
    ...spreadIfDefined('price', readNumber(source, 'price')),
    ...spreadIfDefined('pipeline_id', targetPipelineId),
    ...spreadIfDefined('status_id', resolvedStatusId),
    ...spreadIfDefined('responsible_user_id', readNumber(source, 'responsible_user_id')),
    ...(Array.isArray(customFieldsValues) && customFieldsValues.length > 0
      ? { custom_fields_values: customFieldsValues }
      : {}),
    ...(Object.keys(embedded).length > 0 ? { _embedded: embedded } : {}),
  };
}

function buildEmbedded({ source }: { source: Record<string, unknown> }): Record<string, unknown> {
  const embedded = isRecord(source['_embedded']) ? source['_embedded'] : {};
  const tags = readIdObjects(embedded['tags']);
  const contacts = readIdObjects(embedded['contacts']);
  const companies = readIdObjects(embedded['companies']);
  return {
    ...(tags.length > 0 ? { tags } : {}),
    ...(contacts.length > 0 ? { contacts } : {}),
    ...(companies.length > 0 ? { companies } : {}),
  };
}

// ponytail: per-item best-effort copy — system notes amo refuses are skipped; single-lead copy keeps N small
async function copyNotes({ auth, sourceId, targetId }: CopyChildParams): Promise<void> {
  const notes = await amoClient.fetchAllPages({
    auth,
    path: `/leads/${sourceId}/notes`,
    embeddedKey: 'notes',
  });
  for (const note of notes) {
    if (!isRecord(note)) {
      continue;
    }
    const noteType = readString(note, 'note_type');
    if (isNil(noteType)) {
      continue;
    }
    const params = isRecord(note['params']) ? note['params'] : {};
    await tryCatch(() =>
      amoClient.makeRequest({
        auth,
        method: HttpMethod.POST,
        path: `/leads/${targetId}/notes`,
        body: [{ note_type: noteType, params }],
      }),
    );
  }
}

async function copyTasks({ auth, sourceId, targetId }: CopyChildParams): Promise<void> {
  const tasks = await amoClient.fetchAllPages({
    auth,
    path: `/tasks?filter[entity_type]=leads&filter[entity_id]=${sourceId}`,
    embeddedKey: 'tasks',
  });
  const bodies = tasks.flatMap((task) => {
    if (!isRecord(task)) {
      return [];
    }
    const text = readString(task, 'text');
    const completeTill = readNumber(task, 'complete_till');
    if (isNil(text) || isNil(completeTill)) {
      return [];
    }
    return [
      {
        text,
        complete_till: completeTill,
        entity_id: targetId,
        entity_type: 'leads',
        ...spreadIfDefined('task_type_id', readNumber(task, 'task_type_id')),
        ...spreadIfDefined('responsible_user_id', readNumber(task, 'responsible_user_id')),
      },
    ];
  });
  if (bodies.length > 0) {
    await tryCatch(() =>
      amoClient.makeRequest({ auth, method: HttpMethod.POST, path: '/tasks', body: bodies }),
    );
  }
}

async function fetchStatuses({
  auth,
  pipelineId,
}: {
  auth: AmocrmAuthProps;
  pipelineId: number | undefined;
}): Promise<StatusMeta[]> {
  if (isNil(pipelineId)) {
    return [];
  }
  const items = await amoClient.fetchAllPages({
    auth,
    path: `/leads/pipelines/${pipelineId}/statuses`,
    embeddedKey: 'statuses',
  });
  return items.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const id = readNumber(item, 'id');
    if (isNil(id)) {
      return [];
    }
    return [{ id, type: readNumber(item, 'type') ?? 0, sort: readNumber(item, 'sort') ?? 0 }];
  });
}

function isUnsortedStatus({ statusId, statuses }: { statusId: number; statuses: StatusMeta[] }): boolean {
  const status = statuses.find((candidate) => candidate.id === statusId);
  return !isNil(status) && status.type === UNSORTED_STATUS_TYPE;
}

function firstNormalStatusId({ statuses }: { statuses: StatusMeta[] }): number | undefined {
  const normal = statuses
    .filter((status) => status.type === NORMAL_STATUS_TYPE && !SYSTEM_STATUS_IDS.includes(status.id))
    .sort((a, b) => a.sort - b.sort);
  return normal.length > 0 ? normal[0].id : undefined;
}

function firstCreatedLead({ response }: { response: unknown }): unknown {
  if (!isRecord(response) || !isRecord(response['_embedded'])) {
    return undefined;
  }
  const leads = response['_embedded']['leads'];
  return Array.isArray(leads) ? leads[0] : undefined;
}

function readIdObjects(value: unknown): { id: number }[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) =>
    isRecord(item) && typeof item['id'] === 'number' ? [{ id: item['id'] }] : [],
  );
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' ? value : undefined;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const copyLeadInternals = { resolveTargetStatusId };

const UNSORTED_STATUS_TYPE = 1;
const NORMAL_STATUS_TYPE = 0;
const SYSTEM_STATUS_IDS = [142, 143];

type StatusMeta = {
  id: number;
  type: number;
  sort: number;
};

type ResolveStatusParams = {
  sourcePipelineId: number | undefined;
  sourceStatusId: number | undefined;
  targetPipelineId: number | undefined;
  targetStatusId: number | undefined;
  statuses: StatusMeta[];
};

type BuildCopyBodyParams = {
  source: Record<string, unknown>;
  newName: string | undefined;
  targetPipelineId: number | undefined;
  resolvedStatusId: number | undefined;
};

type CopyChildParams = {
  auth: AmocrmAuthProps;
  sourceId: number;
  targetId: number;
};
