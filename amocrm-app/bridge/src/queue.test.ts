import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

let db: typeof import('./db.js').db
let computeEventKey: typeof import('./queue.js').computeEventKey
let markEventOnce: typeof import('./queue.js').markEventOnce
let enqueuePendingLaunch: typeof import('./queue.js').enqueuePendingLaunch
let drainPendingLaunchesOnce: typeof import('./queue.js').drainPendingLaunchesOnce
let runDrainTick: typeof import('./queue.js').runDrainTick

const ACCOUNT_ID = '32453394'
const FLOW_ID = 'flow-owned'

function seedActiveAccount(): void {
    db.prepare(
        'INSERT OR REPLACE INTO accounts (install_key, account_id, subdomain, amo_token, status, created_at) VALUES (?, ?, ?, NULL, ?, ?)',
    ).run('key-queue', ACCOUNT_ID, 'dzenteamdev', 'active', '2026-07-12T00:00:00.000Z')
}

// Роутер fetch-мока: сессия форка + листинг owned webhook-flow + управляемый
// исход вызова запуска (для симуляции недоступного/восстановленного форка).
function ownedFlowFetchMock({ webhook }: { webhook: 'ok' | 'down' }): (input: string) => Promise<Response> {
    return vi.fn(async (input: string) => {
        if (input.includes('/managed-authn/external-token')) {
            return new Response(JSON.stringify({ token: 'sess', projectId: 'proj' }), { status: 200 })
        }
        if (input.includes('/api/v1/flows')) {
            return new Response(JSON.stringify({
                data: [{
                    id: FLOW_ID,
                    version: {
                        displayName: 'Owned',
                        trigger: { type: 'PIECE_TRIGGER', settings: { pieceName: '@activepieces/piece-webhook', triggerName: 'catch_webhook' } },
                    },
                }],
            }), { status: 200 })
        }
        if (input.includes('/api/v1/webhooks/')) {
            return webhook === 'ok' ? new Response('{}', { status: 200 }) : new Response('{}', { status: 503 })
        }
        return new Response('{}', { status: 200 })
    })
}

beforeAll(async () => {
    const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
    })
    const dir = mkdtempSync(join(tmpdir(), 'dzenflow-queue-test-'))
    const keyPath = join(dir, 'signing-key.pem')
    writeFileSync(keyPath, privateKey)

    process.env.PORT = '8083'
    process.env.FORK_URL = 'https://fork.test'
    process.env.BRIDGE_PUBLIC_URL = 'https://fork.test/bridge'
    process.env.SIGNING_KEY_PATH = keyPath
    process.env.SIGNING_KEY_ID = 'test-kid'
    process.env.DB_PATH = join(dir, 'bridge.db')
    process.env.FORK_API_KEY = 'sk-test'
    process.env.DP_SECRET = 'dp-test-secret'

    ;({ db } = await import('./db.js'))
    ;({ computeEventKey, markEventOnce, enqueuePendingLaunch, drainPendingLaunchesOnce, runDrainTick } = await import('./queue.js'))
    seedActiveAccount()
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('runDrainTick', () => {
    it('параллельный тик не обрабатывает те же строки (гард наложения)', async () => {
        let release!: () => void
        const gate = new Promise<void>((resolve) => { release = resolve })
        const inner = ownedFlowFetchMock({ webhook: 'ok' })
        const fetchMock = vi.fn(async (input: string) => {
            await gate
            return inner(input)
        })
        vi.stubGlobal('fetch', fetchMock)
        const app = Fastify()
        const eventKey = `tick-overlap-${Math.random()}`
        enqueuePendingLaunch({ eventKey, accountId: ACCOUNT_ID, flowId: FLOW_ID, source: 'amocrm_dp', extra: {}, now: Date.now() })

        // draining выставляется синхронно при первом вызове — второй тик обязан
        // выйти сразу, не читая те же строки (иначе двойной запуск flow).
        const first = runDrainTick({ log: app.log })
        const callsAfterFirst = fetchMock.mock.calls.length
        await runDrainTick({ log: app.log })
        expect(fetchMock.mock.calls.length).toBe(callsAfterFirst)

        release()
        await first
        const row = db.prepare('SELECT * FROM pending_launches WHERE event_key = ?').get(eventKey)
        expect(row).toBeUndefined()
        const webhookCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/api/v1/webhooks/'))
        expect(webhookCalls.length).toBe(1)
        await app.close()
    })
})

describe('computeEventKey', () => {
    it('одно и то же событие даёт один и тот же ключ', () => {
        const event = { time: 100, data: { leads: [{ id: 555 }] } }
        expect(computeEventKey({ accountId: ACCOUNT_ID, flowId: FLOW_ID, event }))
            .toBe(computeEventKey({ accountId: ACCOUNT_ID, flowId: FLOW_ID, event }))
    })

    it('другой entity_id в data даёт другой ключ', () => {
        const a = computeEventKey({ accountId: ACCOUNT_ID, flowId: FLOW_ID, event: { time: 100, data: { leads: [{ id: 1 }] } } })
        const b = computeEventKey({ accountId: ACCOUNT_ID, flowId: FLOW_ID, event: { time: 100, data: { leads: [{ id: 2 }] } } })
        expect(a).not.toBe(b)
    })

    it('другой flowId при одинаковом событии даёт другой ключ', () => {
        const event = { time: 100, data: { id: 1 } }
        const a = computeEventKey({ accountId: ACCOUNT_ID, flowId: 'flow-a', event })
        const b = computeEventKey({ accountId: ACCOUNT_ID, flowId: 'flow-b', event })
        expect(a).not.toBe(b)
    })
})

describe('markEventOnce', () => {
    it('первый раз — true, повтор того же ключа — false', () => {
        const key = `unit-test-key-${Math.random()}`
        expect(markEventOnce({ eventKey: key, now: 1000 })).toBe(true)
        expect(markEventOnce({ eventKey: key, now: 2000 })).toBe(false)
    })
})

describe('drainPendingLaunchesOnce', () => {
    it('форк недоступен → attempts растёт, строка остаётся в очереди', async () => {
        vi.stubGlobal('fetch', ownedFlowFetchMock({ webhook: 'down' }))
        const app = Fastify()
        const eventKey = `pending-retry-${Math.random()}`
        enqueuePendingLaunch({ eventKey, accountId: ACCOUNT_ID, flowId: FLOW_ID, source: 'amocrm_dp', extra: {}, now: Date.now() })
        await drainPendingLaunchesOnce({ log: app.log })
        const row = db.prepare('SELECT attempts FROM pending_launches WHERE event_key = ?').get(eventKey) as { attempts: number } | undefined
        expect(row?.attempts).toBe(1)
        await app.close()
    })

    it('форк снова жив → запуск проходит, строка удаляется из очереди', async () => {
        const eventKey = `pending-recover-${Math.random()}`
        vi.stubGlobal('fetch', ownedFlowFetchMock({ webhook: 'down' }))
        enqueuePendingLaunch({ eventKey, accountId: ACCOUNT_ID, flowId: FLOW_ID, source: 'amocrm_dp', extra: {}, now: Date.now() })
        const app = Fastify()
        await drainPendingLaunchesOnce({ log: app.log })

        vi.stubGlobal('fetch', ownedFlowFetchMock({ webhook: 'ok' }))
        await drainPendingLaunchesOnce({ log: app.log })
        const row = db.prepare('SELECT * FROM pending_launches WHERE event_key = ?').get(eventKey)
        expect(row).toBeUndefined()
        await app.close()
    })

    it('после 20 неудач подряд строка удаляется без запуска (giving up)', async () => {
        vi.stubGlobal('fetch', ownedFlowFetchMock({ webhook: 'down' }))
        const eventKey = `pending-giveup-${Math.random()}`
        enqueuePendingLaunch({ eventKey, accountId: ACCOUNT_ID, flowId: FLOW_ID, source: 'amocrm_dp', extra: {}, now: Date.now() })
        const app = Fastify()
        for (let i = 0; i < 20; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await drainPendingLaunchesOnce({ log: app.log })
        }
        const row = db.prepare('SELECT * FROM pending_launches WHERE event_key = ?').get(eventKey)
        expect(row).toBeUndefined()
        await app.close()
    })
})
