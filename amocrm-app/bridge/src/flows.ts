import type { FastifyInstance } from 'fastify'
import { db } from './db.js'
import { exchangeExternalToken, listEnabledFlows } from './fork-client.js'
import type { FlowSummary } from './fork-client.js'
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
// Токен форка живёт 7 дней — держим его в памяти и переобмениваем только при
// протухании (TTL) или 401 (одна повторная попытка со сбросом кэша).
export async function getEnabledFlows({ accountId, subdomain, now }: GetEnabledFlowsParams): Promise<EnabledFlowsResult> {
    let session = await ensureSession({ accountId, subdomain, now })
    if (!session.ok) {
        return { ok: false, reason: session.reason }
    }
    let listed = await listEnabledFlows({ token: session.token, projectId: session.projectId })
    if (!listed.ok && listed.unauthorized) {
        sessions.delete(accountId)
        session = await ensureSession({ accountId, subdomain, now })
        if (!session.ok) {
            return { ok: false, reason: session.reason }
        }
        listed = await listEnabledFlows({ token: session.token, projectId: session.projectId })
    }
    if (!listed.ok) {
        return { ok: false, reason: listed.reason }
    }
    return { ok: true, flows: listed.flows, projectId: session.projectId }
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

function activeAccount({ installKey, accountId }: ValidatedFlowsQuery): { subdomain: string } | null {
    const row = db
        .prepare('SELECT subdomain FROM accounts WHERE install_key = ? AND account_id = ? AND status = ?')
        .get(installKey, accountId, 'active') as { subdomain: string } | undefined
    return row ?? null
}

function validateFlowsQuery(query: unknown): ValidatedFlowsQuery | { error: string } {
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

export type GetEnabledFlowsParams = { accountId: string, subdomain: string, now: number }
export type EnabledFlowsResult =
    | { ok: true, flows: FlowSummary[], projectId: string }
    | { ok: false, reason: string }
export type ValidatedFlowsQuery = { installKey: string, accountId: string }
