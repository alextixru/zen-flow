import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

let db: typeof import('./db.js').db
let parseDpPayload: typeof import('./dp.js').parseDpPayload
let registerDp: typeof import('./dp.js').registerDp

const ACCOUNT_ID = '32453394'
const OWNED_FLOW = 'flow-owned'

function seedActiveAccount(): void {
    db.prepare(
        'INSERT OR REPLACE INTO accounts (install_key, account_id, subdomain, amo_token, status, created_at) VALUES (?, ?, ?, NULL, ?, ?)',
    ).run('key-dp', ACCOUNT_ID, 'dzenteamdev', 'active', '2026-07-12T00:00:00.000Z')
}

// Роутер fetch-мока: обмен JWT -> сессия, листинг flow (owned webhook-флоу), запуск webhook.
function routedFetch(): ReturnType<typeof vi.fn> {
    return vi.fn(async (input: string) => {
        if (input.includes('/managed-authn/external-token')) {
            return new Response(JSON.stringify({ token: 'sess', projectId: 'proj' }), { status: 200 })
        }
        if (input.includes('/api/v1/flows')) {
            return new Response(JSON.stringify({
                data: [{
                    id: OWNED_FLOW,
                    version: {
                        displayName: 'Owned',
                        trigger: { type: 'PIECE_TRIGGER', settings: { pieceName: '@activepieces/piece-webhook', triggerName: 'catch_webhook' } },
                    },
                }],
            }), { status: 200 })
        }
        return new Response('{}', { status: 200 })
    })
}

function dpBody(flowId: string): unknown {
    return {
        account_id: ACCOUNT_ID,
        subdomain: 'dzenteamdev',
        event: { type: 'status', time: 1 },
        action: { settings: { widget: { settings: { flow_id: flowId } } } },
    }
}

async function postDp({ query, body }: { query: string, body: unknown }): Promise<number> {
    const app = Fastify()
    registerDp(app)
    const response = await app.inject({ method: 'POST', url: `/dp${query}`, payload: body as Record<string, unknown> })
    await app.close()
    return response.statusCode
}

beforeAll(async () => {
    const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
    })
    const dir = mkdtempSync(join(tmpdir(), 'dzenflow-dp-test-'))
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
    ;({ parseDpPayload, registerDp } = await import('./dp.js'))
    seedActiveAccount()
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('parseDpPayload', () => {
    it('extracts flow_id from action.settings.widget.settings', () => {
        expect(parseDpPayload(dpBody('f1'))).toEqual({ accountId: ACCOUNT_ID, flowId: 'f1', event: { type: 'status', time: 1 } })
    })

    it('rejects payload without flow_id', () => {
        expect(parseDpPayload({ account_id: ACCOUNT_ID, action: {} })).toBeNull()
    })

    it('rejects payload without account_id', () => {
        expect(parseDpPayload({ action: { settings: { widget: { settings: { flow_id: 'f1' } } } } })).toBeNull()
    })
})

describe('POST /dp', () => {
    it('rejects a wrong secret with 403 and never touches the fork', async () => {
        const fetchMock = routedFetch()
        vi.stubGlobal('fetch', fetchMock)
        expect(await postDp({ query: '?k=wrong', body: dpBody(OWNED_FLOW) })).toBe(403)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects an unknown account with 403', async () => {
        vi.stubGlobal('fetch', routedFetch())
        const body = { ...(dpBody(OWNED_FLOW) as Record<string, unknown>), account_id: '999999' }
        expect(await postDp({ query: '?k=dp-test-secret', body })).toBe(403)
    })

    it('rejects an invalid payload with 400', async () => {
        vi.stubGlobal('fetch', routedFetch())
        expect(await postDp({ query: '?k=dp-test-secret', body: { account_id: ACCOUNT_ID } })).toBe(400)
    })

    it('accepts a valid event and launches the owned flow via webhook', async () => {
        const fetchMock = routedFetch()
        vi.stubGlobal('fetch', fetchMock)
        expect(await postDp({ query: '?k=dp-test-secret', body: dpBody(OWNED_FLOW) })).toBe(200)
        await vi.waitFor(() => {
            expect(fetchMock.mock.calls.some(([url]) => String(url).includes(`/api/v1/webhooks/${OWNED_FLOW}`))).toBe(true)
        })
    })

    it('drops a foreign flow_id: 200 but no webhook launch', async () => {
        const fetchMock = routedFetch()
        vi.stubGlobal('fetch', fetchMock)
        expect(await postDp({ query: '?k=dp-test-secret', body: dpBody('flow-of-another-client') })).toBe(200)
        await vi.waitFor(() => {
            expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/v1/flows'))).toBe(true)
        })
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/v1/webhooks/'))).toBe(false)
    })

    it('W017: a repeated identical event launches the webhook only once', async () => {
        const fetchMock = routedFetch()
        vi.stubGlobal('fetch', fetchMock)
        const body = { ...(dpBody(OWNED_FLOW) as Record<string, unknown>), event: { type: 'status', time: 424242 } }
        expect(await postDp({ query: '?k=dp-test-secret', body })).toBe(200)
        expect(await postDp({ query: '?k=dp-test-secret', body })).toBe(200)
        await vi.waitFor(() => {
            const calls = fetchMock.mock.calls.filter(([url]) => String(url).includes(`/api/v1/webhooks/${OWNED_FLOW}`))
            expect(calls.length).toBe(1)
        })
    })

    it('W017: fork unreachable at the webhook step queues the event in pending_launches', async () => {
        const fetchMock = vi.fn(async (input: string) => {
            if (input.includes('/managed-authn/external-token')) {
                return new Response(JSON.stringify({ token: 'sess-w017', projectId: 'proj-w017' }), { status: 200 })
            }
            if (input.includes('/api/v1/flows')) {
                return new Response(JSON.stringify({
                    data: [{
                        id: OWNED_FLOW,
                        version: {
                            displayName: 'Owned',
                            trigger: { type: 'PIECE_TRIGGER', settings: { pieceName: '@activepieces/piece-webhook', triggerName: 'catch_webhook' } },
                        },
                    }],
                }), { status: 200 })
            }
            if (input.includes('/api/v1/webhooks/')) {
                return new Response('{}', { status: 503 })
            }
            return new Response('{}', { status: 200 })
        })
        vi.stubGlobal('fetch', fetchMock)
        const body = { ...(dpBody(OWNED_FLOW) as Record<string, unknown>), event: { type: 'status', time: 555555 } }
        expect(await postDp({ query: '?k=dp-test-secret', body })).toBe(200)
        await vi.waitFor(() => {
            const row = db.prepare('SELECT * FROM pending_launches WHERE account_id = ? AND flow_id = ?').get(ACCOUNT_ID, OWNED_FLOW)
            expect(row).toBeDefined()
        })
    })
})
