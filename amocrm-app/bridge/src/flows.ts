import type { FastifyInstance } from 'fastify'
import { db } from './db.js'
import { exchangeExternalToken, listEnabledFlows, listRecentRuns } from './fork-client.js'
import type { FlowSummary, RunSummary } from './fork-client.js'
import { signEmbedJwt } from './jwt.js'
import { PROVISIONER_USER_ID } from './provision-connection.js'

export function registerFlows(app: FastifyInstance): void {
    app.get('/flows', async (request, reply) => {
        const validated = validateFlowsQuery(request.query)
        if ('error' in validated) {
            return reply.code(400).send({ error: validated.error })
        }
        const account = activeAccount(validated)
        if (account === null) {
            return reply.code(403).send({ error: 'unknown account' })
        }
        const result = await getEnabledFlows({
            accountId: validated.accountId,
            subdomain: account.subdomain,
            now: Date.now(),
        })
        if (!result.ok) {
            request.log.warn({ accountId: validated.accountId, reason: result.reason }, 'flows listing failed')
            return reply.code(502).send({ error: 'fork unavailable' })
        }
        return result.flows
            .filter((flow) => flow.webhookCompatible)
            .map((flow) => ({ id: flow.id, displayName: flow.displayName }))
    })
}

// Список включённых flow аккаунта под кэшированной project-сессией.
export async function getEnabledFlows({ accountId, subdomain, now }: GetEnabledFlowsParams): Promise<EnabledFlowsResult> {
    const result = await callWithSession<FlowSummary[]>({ accountId, subdomain, now }, (session) =>
        listEnabledFlows({ token: session.token, projectId: session.projectId }).then((listed) =>
            listed.ok
                ? { ok: true as const, value: listed.flows }
                : { ok: false as const, reason: listed.reason, unauthorized: listed.unauthorized }))
    if (!result.ok) {
        return { ok: false, reason: result.reason }
    }
    return { ok: true, flows: result.value, projectId: result.projectId }
}

// Последние раны проекта под той же кэшированной сессией.
export async function getRecentRuns({ accountId, subdomain, now, limit }: GetRecentRunsParams): Promise<RecentRunsResult> {
    const result = await callWithSession<RunSummary[]>({ accountId, subdomain, now }, (session) =>
        listRecentRuns({ token: session.token, projectId: session.projectId, limit }).then((listed) =>
            listed.ok
                ? { ok: true as const, value: listed.runs }
                : { ok: false as const, reason: listed.reason, unauthorized: listed.unauthorized }))
    if (!result.ok) {
        return { ok: false, reason: result.reason }
    }
    return { ok: true, runs: result.value }
}

// Выполняет запрос к форку под кэшированной project-сессией аккаунта. Токен форка
// живёт 7 дней — держим его в памяти; на 401 (протухший токен) один раз сбрасываем
// кэш и переобмениваем JWT. Общий для /flows и /runs — 401-логика в одном месте.
async function callWithSession<T>({ accountId, subdomain, now }: GetEnabledFlowsParams, call: SessionCall<T>): Promise<SessionCallResult<T>> {
    let session = await ensureSession({ accountId, subdomain, now })
    if (!session.ok) {
        return { ok: false, reason: session.reason }
    }
    let result = await call({ token: session.token, projectId: session.projectId })
    if (!result.ok && result.unauthorized) {
        sessions.delete(accountId)
        session = await ensureSession({ accountId, subdomain, now })
        if (!session.ok) {
            return { ok: false, reason: session.reason }
        }
        result = await call({ token: session.token, projectId: session.projectId })
    }
    if (!result.ok) {
        return { ok: false, reason: result.reason }
    }
    return { ok: true, value: result.value, projectId: session.projectId }
}

async function ensureSession({ accountId, subdomain, now }: GetEnabledFlowsParams): Promise<SessionResult> {
    const cached = sessions.get(accountId)
    if (cached !== undefined && now - cached.cachedAt < SESSION_TTL_MS) {
        return { ok: true, token: cached.token, projectId: cached.projectId }
    }
    // Провижинер (не реальный embed-юзер) — чтобы листинг flow не менял роль клиента;
    // тот же externalUserId, что и в W009, резолвит существующего bridge-пользователя.
    const jwtToken = signEmbedJwt({
        accountId,
        subdomain,
        user: { id: PROVISIONER_USER_ID, firstName: 'amoCRM', lastName: 'Bridge' },
        role: 'Admin',
    })
    const exchange = await exchangeExternalToken({ externalAccessToken: jwtToken })
    if (!exchange.ok) {
        return { ok: false, reason: `exchange: ${exchange.reason}` }
    }
    sessions.set(accountId, { token: exchange.token, projectId: exchange.projectId, cachedAt: now })
    return { ok: true, token: exchange.token, projectId: exchange.projectId }
}

// Активная связка install_key+account_id (клиент шлёт ключ — он подтверждает его).
export function activeAccount({ installKey, accountId }: ValidatedFlowsQuery): { subdomain: string } | null {
    const row = db
        .prepare('SELECT subdomain FROM accounts WHERE install_key = ? AND account_id = ? AND status = ?')
        .get(installKey, accountId, 'active') as { subdomain: string } | undefined
    return row ?? null
}

export function validateFlowsQuery(query: unknown): ValidatedFlowsQuery | { error: string } {
    if (typeof query !== 'object' || query === null) {
        return { error: 'invalid query' }
    }
    const record = query as Record<string, unknown>
    const installKey = record.install_key
    if (typeof installKey !== 'string' || installKey === '') {
        return { error: 'install_key required' }
    }
    const accountId = normalizeAccountId(record.account_id)
    if (accountId === null) {
        return { error: 'account_id must be a positive integer' }
    }
    return { installKey, accountId }
}

function normalizeAccountId(raw: unknown): string | null {
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
    if (!Number.isInteger(value) || value <= 0) {
        return null
    }
    return String(value)
}

// ponytail: access-token форка кэшируем 6д (живёт 7) в памяти процесса; на несколько
// инстансов моста — вынести в SQLite/redis, пока один процесс достаточно.
const SESSION_TTL_MS = 6 * 24 * 60 * 60 * 1000

const sessions = new Map<string, ForkSession>()

type ForkSession = { token: string, projectId: string, cachedAt: number }

type SessionResult = { ok: true, token: string, projectId: string } | { ok: false, reason: string }

type SessionCall<T> = (session: { token: string, projectId: string }) => Promise<
    { ok: true, value: T } | { ok: false, reason: string, unauthorized?: boolean }
>
type SessionCallResult<T> = { ok: true, value: T, projectId: string } | { ok: false, reason: string }

export type GetEnabledFlowsParams = { accountId: string, subdomain: string, now: number }
export type GetRecentRunsParams = { accountId: string, subdomain: string, now: number, limit: number }
export type EnabledFlowsResult =
    | { ok: true, flows: FlowSummary[], projectId: string }
    | { ok: false, reason: string }
export type RecentRunsResult =
    | { ok: true, runs: RunSummary[] }
    | { ok: false, reason: string }
export type ValidatedFlowsQuery = { installKey: string, accountId: string }
