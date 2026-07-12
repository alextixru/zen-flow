import { createHash } from 'node:crypto'
import type { FastifyBaseLogger } from 'fastify'
import { db } from './db.js'
import { launchOwnedFlow } from './flow-launch.js'

db.exec(`
    CREATE TABLE IF NOT EXISTS processed_events (
        event_key TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
    )
`)

db.exec(`
    CREATE TABLE IF NOT EXISTS pending_launches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_key TEXT NOT NULL UNIQUE,
        account_id TEXT NOT NULL,
        flow_id TEXT NOT NULL,
        source TEXT NOT NULL,
        extra_json TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
    )
`)

// Ключ дедупа — hash(account+flow+time+entity). Форма event.data ещё не
// подтверждена живьём (digital_pipeline не установлен на аккаунте, см. W015)
// — extractEntityId ищет "id" в первых уровнях data, иначе хеширует весь data
// целиком; в обоих случаях два вызова с одинаковым событием дают один ключ.
export function computeEventKey({ accountId, flowId, event }: { accountId: string, flowId: string, event: unknown }): string {
    const record = typeof event === 'object' && event !== null ? event as Record<string, unknown> : {}
    const time = typeof record.time === 'number' || typeof record.time === 'string' ? String(record.time) : ''
    const entityId = extractEntityId(record.data)
    return createHash('sha256').update(`${accountId}|${flowId}|${time}|${entityId}`).digest('hex')
}

// true — событие новое, обработать; false — этот event_key уже видели (дроп
// повторного вебхука amo). Чистка протухших строк (TTL сутки) идёт при вставке.
export function markEventOnce({ eventKey, now }: { eventKey: string, now: number }): boolean {
    db.prepare('DELETE FROM processed_events WHERE created_at < ?').run(now - PROCESSED_TTL_MS)
    const result = db.prepare('INSERT OR IGNORE INTO processed_events (event_key, created_at) VALUES (?, ?)').run(eventKey, now)
    return result.changes > 0
}

export function enqueuePendingLaunch({ eventKey, accountId, flowId, source, extra, now }: EnqueueParams): void {
    db.prepare(
        'INSERT OR IGNORE INTO pending_launches (event_key, account_id, flow_id, source, extra_json, attempts, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
    ).run(eventKey, accountId, flowId, source, JSON.stringify(extra ?? {}), now)
}

export function startPendingLaunchWorker({ log }: { log: FastifyBaseLogger }): NodeJS.Timeout {
    return setInterval(() => {
        void drainPendingLaunchesOnce({ log })
    }, RETRY_INTERVAL_MS)
}

// Один проход очереди — экспортирован отдельно от setInterval, чтобы тесты
// могли прогнать его напрямую без фейковых таймеров.
export async function drainPendingLaunchesOnce({ log }: { log: FastifyBaseLogger }): Promise<void> {
    const rows = db.prepare('SELECT * FROM pending_launches').all() as PendingRow[]
    for (const row of rows) {
        const outcome = await launchOwnedFlow({
            accountId: row.account_id,
            flowId: row.flow_id,
            source: row.source,
            extra: JSON.parse(row.extra_json) as Record<string, unknown>,
            log,
        })
        if (outcome.status !== 'unreachable') {
            // launched: цель достигнута. not_owned/unknown_account: перманентный
            // отказ (аккаунт отвязан/flow удалён между попытками) — ретраить нечего.
            db.prepare('DELETE FROM pending_launches WHERE id = ?').run(row.id)
            continue
        }
        const attempts = row.attempts + 1
        if (attempts >= MAX_ATTEMPTS) {
            log.warn({ accountId: row.account_id, flowId: row.flow_id, attempts }, 'pending launch: giving up')
            db.prepare('DELETE FROM pending_launches WHERE id = ?').run(row.id)
            continue
        }
        db.prepare('UPDATE pending_launches SET attempts = ? WHERE id = ?').run(attempts, row.id)
    }
}

function extractEntityId(data: unknown, depth = 0): string {
    if (depth > 2 || typeof data !== 'object' || data === null) {
        return ''
    }
    const record = data as Record<string, unknown>
    if (typeof record.id === 'string' || typeof record.id === 'number') {
        return String(record.id)
    }
    for (const value of Object.values(record)) {
        const found = extractEntityId(Array.isArray(value) ? value[0] : value, depth + 1)
        if (found !== '') {
            return found
        }
    }
    return JSON.stringify(data)
}

const PROCESSED_TTL_MS = 24 * 60 * 60 * 1000
const RETRY_INTERVAL_MS = 30_000
const MAX_ATTEMPTS = 20

type PendingRow = {
    id: number
    event_key: string
    account_id: string
    flow_id: string
    source: string
    extra_json: string
    attempts: number
    created_at: number
}

type EnqueueParams = {
    eventKey: string
    accountId: string
    flowId: string
    source: string
    extra?: Record<string, unknown>
    now: number
}
