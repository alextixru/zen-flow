import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

let db: typeof import('./db.js').db
let parseSalesbotPayload: typeof import('./salesbot.js').parseSalesbotPayload
let registerSalesbot: typeof import('./salesbot.js').registerSalesbot

const ACCOUNT_ID = '32453394'
const OWNED_FLOW = 'flow-owned'

function seedActiveAccount(): void {
    db.prepare(
        'INSERT OR REPLACE INTO accounts (install_key, account_id, subdomain, amo_token, status, created_at) VALUES (?, ?, ?, NULL, ?, ?)',
    ).run('key-sb', ACCOUNT_ID, 'dzenteamdev', 'active', '2026-07-12T00:00:00.000Z')
}

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

function sbBody(flowId: string): unknown {
    return { flow_id: flowId, account_id: ACCOUNT_ID, subdomain: 'dzenteamdev' }
}

async function postSalesbot({ query, body }: { query: string, body: unknown }): Promise<number> {
    const app = Fastify()
    registerSalesbot(app)
    const response = await app.inject({ method: 'POST', url: `/salesbot${query}`, payload: body as Record<string, unknown> })
    await app.close()
    return response.statusCode
}

beforeAll(async () => {
    const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
    })
    const dir = mkdtempSync(join(tmpdir(), 'dzenflow-sb-test-'))
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
    ;({ parseSalesbotPayload, registerSalesbot } = await import('./salesbot.js'))
    seedActiveAccount()
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('parseSalesbotPayload', () => {
    it('extracts flat flow_id + account_id', () => {
        expect(parseSalesbotPayload(sbBody('f1'))).toEqual({ accountId: ACCOUNT_ID, flowId: 'f1' })
    })

    it('extracts from amo widget_request wrapper {token, data, return_url}', () => {
        const body = { token: 'jwt-amo', data: { flow_id: 'f1', account_id: ACCOUNT_ID, subdomain: 'dzenteamdev' }, return_url: 'https://x/continue' }
        expect(parseSalesbotPayload(body)).toEqual({ accountId: ACCOUNT_ID, flowId: 'f1' })
    })

    it('rejects payload without flow_id', () => {
        expect(parseSalesbotPayload({ account_id: ACCOUNT_ID })).toBeNull()
    })

    it('rejects payload without account_id', () => {
        expect(parseSalesbotPayload({ flow_id: 'f1' })).toBeNull()
    })
})

describe('POST /salesbot', () => {
    it('rejects a wrong secret with 403 and never touches the fork', async () => {
        const fetchMock = routedFetch()
        vi.stubGlobal('fetch', fetchMock)
        expect(await postSalesbot({ query: '?k=wrong', body: sbBody(OWNED_FLOW) })).toBe(403)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects an unknown account with 403', async () => {
        vi.stubGlobal('fetch', routedFetch())
        const body = { ...(sbBody(OWNED_FLOW) as Record<string, unknown>), account_id: '999999' }
        expect(await postSalesbot({ query: '?k=dp-test-secret', body })).toBe(403)
    })

    it('rejects an invalid payload with 400', async () => {
        vi.stubGlobal('fetch', routedFetch())
        expect(await postSalesbot({ query: '?k=dp-test-secret', body: { account_id: ACCOUNT_ID } })).toBe(400)
    })

    it('accepts a valid step and launches the owned flow via webhook', async () => {
        const fetchMock = routedFetch()
        vi.stubGlobal('fetch', fetchMock)
        expect(await postSalesbot({ query: '?k=dp-test-secret', body: sbBody(OWNED_FLOW) })).toBe(200)
        await vi.waitFor(() => {
            expect(fetchMock.mock.calls.some(([url]) => String(url).includes(`/api/v1/webhooks/${OWNED_FLOW}`))).toBe(true)
        })
    })

    it('drops a foreign flow_id: 200 but no webhook launch', async () => {
        const fetchMock = routedFetch()
        vi.stubGlobal('fetch', fetchMock)
        expect(await postSalesbot({ query: '?k=dp-test-secret', body: sbBody('flow-of-another-client') })).toBe(200)
        await vi.waitFor(() => {
            expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/v1/flows'))).toBe(true)
        })
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/v1/webhooks/'))).toBe(false)
    })
})
