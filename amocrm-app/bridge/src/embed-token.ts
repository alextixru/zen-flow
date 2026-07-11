import type { FastifyInstance } from 'fastify'
import { config } from './config.js'
import { db } from './db.js'
import { signEmbedJwt } from './jwt.js'

export function registerEmbedToken(app: FastifyInstance): void {
    app.post('/embed-token', async (request, reply) => {
        const validated = validateEmbedTokenBody(request.body)
        if ('error' in validated) {
            return reply.code(400).send({ error: validated.error })
        }
        if (rateLimitExceeded({ installKey: validated.installKey, now: Date.now() })) {
            return reply.code(429).send({ error: 'too many requests' })
        }
        const result = issueEmbedToken(validated)
        if (!result.ok) {
            return reply.code(403).send({ error: 'embed-token rejected' })
        }
        return { jwtToken: result.jwtToken, instanceUrl: config.forkUrl }
    })
}

export function issueEmbedToken({ installKey, accountId, user }: ValidatedEmbedTokenRequest): EmbedTokenResult {
    // subdomain — из строки БД связки, не из тела запроса: клиент может врать,
    // а subdomain уходит в projectDisplayName и (W008) в CSP-список форка.
    const row = db
        .prepare('SELECT subdomain FROM accounts WHERE install_key = ? AND account_id = ? AND status = ?')
        .get(installKey, accountId, 'active') as { subdomain: string } | undefined
    if (row === undefined) {
        return { ok: false }
    }
    const { firstName, lastName } = splitName(user.name)
    const jwtToken = signEmbedJwt({
        accountId,
        subdomain: row.subdomain,
        user: { id: user.id, firstName, lastName },
        role: 'Editor',
        piecesTags: ['ru-allowed'],
    })
    return { ok: true, jwtToken }
}

export function rateLimitExceeded({ installKey, now }: { installKey: string; now: number }): boolean {
    // ponytail: in-memory fixed window на процесс; upgrade — лимит на реверс-прокси.
    if (rateWindows.size > RATE_LIMIT_MAX_KEYS) {
        rateWindows.clear()
    }
    const window = rateWindows.get(installKey)
    if (window === undefined || now - window.windowStart >= RATE_LIMIT_WINDOW_MS) {
        rateWindows.set(installKey, { windowStart: now, count: 1 })
        return false
    }
    window.count += 1
    return window.count > RATE_LIMIT_MAX_PER_WINDOW
}

export function validateEmbedTokenBody(body: unknown): ValidatedEmbedTokenRequest | { error: string } {
    if (typeof body !== 'object' || body === null) {
        return { error: 'invalid body' }
    }
    const record = body as Record<string, unknown>
    const installKey = record.install_key
    if (typeof installKey !== 'string' || installKey === '') {
        return { error: 'install_key required' }
    }
    const accountId = normalizePositiveInt(record.account_id)
    if (accountId === null) {
        return { error: 'account_id must be a positive integer' }
    }
    const user = record.user
    if (typeof user !== 'object' || user === null) {
        return { error: 'user required' }
    }
    const userRecord = user as Record<string, unknown>
    const userId = normalizePositiveInt(userRecord.id)
    if (userId === null) {
        return { error: 'user.id must be a positive integer' }
    }
    const name = typeof userRecord.name === 'string' ? userRecord.name : ''
    return { installKey, accountId, user: { id: userId, name } }
}

export function splitName(name: string): { firstName: string; lastName: string } {
    const trimmed = name.trim()
    const spaceAt = trimmed.indexOf(' ')
    const first = spaceAt === -1 ? trimmed : trimmed.slice(0, spaceAt)
    const rest = spaceAt === -1 ? '' : trimmed.slice(spaceAt + 1).trim()
    return { firstName: first || 'amoCRM', lastName: rest || 'User' }
}

function normalizePositiveInt(raw: unknown): string | null {
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
    if (!Number.isInteger(value) || value <= 0) {
        return null
    }
    return String(value)
}

const RATE_LIMIT_MAX_PER_WINDOW = 30
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_KEYS = 10_000

const rateWindows = new Map<string, { windowStart: number; count: number }>()

type EmbedTokenResult = { ok: true; jwtToken: string } | { ok: false }

export type ValidatedEmbedTokenRequest = {
    installKey: string
    accountId: string
    user: { id: string; name: string }
}
