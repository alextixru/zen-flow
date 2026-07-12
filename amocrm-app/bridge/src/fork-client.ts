import { config } from './config.js'

// SERVICE-принципал форка: platform API key (sk-…), выпускается POST /v1/api-keys
// под platform-админом. Эндпоинт мержит origins без дублей — повторный вызов безопасен.
export async function addAllowedEmbedOrigin({ subdomain }: { subdomain: string }): Promise<ForkCallResult> {
    const origin = `https://${subdomain}.amocrm.ru`
    try {
        const response = await fetch(`${config.forkUrl}/api/v1/embed-subdomain/allowed-embed-origins`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${config.forkApiKey}`,
            },
            body: JSON.stringify({ allowedEmbedOrigins: [origin] }),
            signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) {
            return { ok: false, reason: `http ${response.status}` }
        }
        return { ok: true }
    }
    catch {
        return { ok: false, reason: 'network error' }
    }
}

// Обмен self-подписанного embed-JWT на project-сессию форка (managed-authn).
// Рабочий путь — /api/v1 (через туннель /v1 отдаёт SPA-HTML — грабля V001).
export async function exchangeExternalToken({ externalAccessToken }: { externalAccessToken: string }): Promise<ExchangeResult> {
    try {
        const response = await fetch(`${config.forkUrl}/api/v1/managed-authn/external-token`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ externalAccessToken }),
            signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) {
            return { ok: false, reason: `http ${response.status}` }
        }
        const body = await response.json() as { token?: unknown, projectId?: unknown }
        if (typeof body.token !== 'string' || typeof body.projectId !== 'string') {
            return { ok: false, reason: 'no project session' }
        }
        return { ok: true, token: body.token, projectId: body.projectId }
    }
    catch {
        return { ok: false, reason: 'network error' }
    }
}

// Апсерт amocrm-connection в проект клиента экшенным токеном (идемпотентно по externalId).
export async function upsertAmocrmConnection({ token, projectId, subdomain, apiToken }: UpsertConnectionParams): Promise<ForkCallResult> {
    try {
        const response = await fetch(`${config.forkUrl}/api/v1/app-connections`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                externalId: 'amocrm',
                displayName: 'amoCRM',
                pieceName: '@activepieces/piece-amocrm',
                projectId,
                type: 'CUSTOM_AUTH',
                value: {
                    type: 'CUSTOM_AUTH',
                    props: { subdomain, zone: 'amocrm.ru', apiToken },
                },
            }),
            signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) {
            return { ok: false, reason: `http ${response.status}` }
        }
        return { ok: true }
    }
    catch {
        return { ok: false, reason: 'network error' }
    }
}

// Тегирование pieces для JWT-фильтра piecesFilterType:'ALLOWED'+piecesTags (см. jwt.ts).
// SERVICE-принципал (platform API key) проходит platformAdminOnly на этом эндпоинте
// без юзерской сессии — POST полностью заменяет набор тегов piece'а, повторный вызов безопасен.
export async function setPieceTags({ pieceNames, tag }: SetPieceTagsParams): Promise<ForkCallResult> {
    try {
        const response = await fetch(`${config.forkUrl}/api/v1/tags/pieces`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${config.forkApiKey}`,
            },
            body: JSON.stringify({ piecesName: pieceNames, tags: [tag] }),
            signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) {
            return { ok: false, reason: `http ${response.status}` }
        }
        return { ok: true }
    }
    catch {
        return { ok: false, reason: 'network error' }
    }
}

// Листинг включённых flow проекта под обменянной project-сессией (Bearer token).
// projectId в query обязателен схемой форка, но фактический фильтр — по projectId
// принципала сессии, так что cross-tenant утечки нет. 401 сигналит протухший токен
// (сброс кэша сессии — забота вызывающего, flows.ts).
export async function listEnabledFlows({ token, projectId }: ListFlowsParams): Promise<ListFlowsResult> {
    const url = `${config.forkUrl}/api/v1/flows?projectId=${encodeURIComponent(projectId)}&status=ENABLED&limit=100`
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10_000),
        })
        if (response.status === 401) {
            return { ok: false, reason: 'http 401', unauthorized: true }
        }
        if (!response.ok) {
            return { ok: false, reason: `http ${response.status}` }
        }
        const body = await response.json() as { data?: unknown }
        if (!Array.isArray(body.data)) {
            return { ok: false, reason: 'unexpected list shape' }
        }
        const flows = body.data.map(toFlowSummary).filter((flow): flow is FlowSummary => flow !== null)
        return { ok: true, flows }
    }
    catch {
        return { ok: false, reason: 'network error' }
    }
}

// Запуск flow через публичный webhook-эндпоинт триггера (async — форк отвечает сразу,
// исполнение уходит в очередь). Аутентификации нет: сам flowId — это webhook-секрет.
export async function runFlowWebhook({ flowId, body }: { flowId: string, body: unknown }): Promise<ForkCallResult> {
    try {
        const response = await fetch(`${config.forkUrl}/api/v1/webhooks/${encodeURIComponent(flowId)}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) {
            return { ok: false, reason: `http ${response.status}` }
        }
        return { ok: true }
    }
    catch {
        return { ok: false, reason: 'network error' }
    }
}

// Последние раны проекта под project-сессией. Раны НЕ фильтруются по сделке
// (ран не знает lead_id) — честное ограничение MVP (W018), UI это оговаривает.
// 401 сигналит протухший токен — сброс кэша сессии на вызывающем (flows.ts).
export async function listRecentRuns({ token, projectId, limit }: ListRunsParams): Promise<ListRunsResult> {
    const url = `${config.forkUrl}/api/v1/flow-runs?projectId=${encodeURIComponent(projectId)}&limit=${limit}`
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10_000),
        })
        if (response.status === 401) {
            return { ok: false, reason: 'http 401', unauthorized: true }
        }
        if (!response.ok) {
            return { ok: false, reason: `http ${response.status}` }
        }
        const body = await response.json() as { data?: unknown }
        if (!Array.isArray(body.data)) {
            return { ok: false, reason: 'unexpected list shape' }
        }
        const runs = body.data.map(toRunSummary).filter((run): run is RunSummary => run !== null)
        return { ok: true, runs }
    }
    catch {
        return { ok: false, reason: 'network error' }
    }
}

// FlowRun -> плоское summary. displayName живёт в flowVersion (ран не несёт его
// на верхнем уровне); created из BaseModelSchema, fallback на startTime.
function toRunSummary(raw: unknown): RunSummary | null {
    if (typeof raw !== 'object' || raw === null) {
        return null
    }
    const run = raw as Record<string, unknown>
    if (typeof run.id !== 'string' || typeof run.flowId !== 'string') {
        return null
    }
    const version = typeof run.flowVersion === 'object' && run.flowVersion !== null ? run.flowVersion as Record<string, unknown> : {}
    const displayName = typeof version.displayName === 'string' ? version.displayName : run.flowId
    const status = typeof run.status === 'string' ? run.status : 'UNKNOWN'
    const created = typeof run.created === 'string' ? run.created : typeof run.startTime === 'string' ? run.startTime : ''
    return { id: run.id, flowId: run.flowId, displayName, status, created }
}

// PopulatedFlow -> плоское summary; webhookCompatible = триггер piece-webhook/catch_webhook.
function toFlowSummary(raw: unknown): FlowSummary | null {
    if (typeof raw !== 'object' || raw === null) {
        return null
    }
    const flow = raw as { id?: unknown, version?: unknown }
    if (typeof flow.id !== 'string') {
        return null
    }
    const version = typeof flow.version === 'object' && flow.version !== null ? flow.version as Record<string, unknown> : {}
    const displayName = typeof version.displayName === 'string' ? version.displayName : flow.id
    const trigger = typeof version.trigger === 'object' && version.trigger !== null ? version.trigger as Record<string, unknown> : {}
    const settings = typeof trigger.settings === 'object' && trigger.settings !== null ? trigger.settings as Record<string, unknown> : {}
    const webhookCompatible = trigger.type === 'PIECE_TRIGGER'
        && settings.pieceName === '@activepieces/piece-webhook'
        && settings.triggerName === 'catch_webhook'
    return { id: flow.id, displayName, webhookCompatible }
}

export type ForkCallResult = { ok: true } | { ok: false, reason: string }
export type ExchangeResult = { ok: true, token: string, projectId: string } | { ok: false, reason: string }
export type UpsertConnectionParams = { token: string, projectId: string, subdomain: string, apiToken: string }
export type SetPieceTagsParams = { pieceNames: string[], tag: string }
export type ListFlowsParams = { token: string, projectId: string }
export type FlowSummary = { id: string, displayName: string, webhookCompatible: boolean }
export type ListFlowsResult =
    | { ok: true, flows: FlowSummary[] }
    | { ok: false, reason: string, unauthorized?: boolean }
export type ListRunsParams = { token: string, projectId: string, limit: number }
export type RunSummary = { id: string, flowId: string, displayName: string, status: string, created: string }
export type ListRunsResult =
    | { ok: true, runs: RunSummary[] }
    | { ok: false, reason: string, unauthorized?: boolean }
