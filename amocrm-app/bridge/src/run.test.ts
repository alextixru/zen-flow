import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

let db: typeof import('./db.js').db
let registerRun: typeof import('./run.js').registerRun

const ACCOUNT_ID = '32453394'
const OWNED_FLOW = 'flow-owned'

function seedActiveAccount(): void {
    db.prepare(
        'INSERT OR REPLACE INTO accounts (install_key, account_id, subdomain, amo_token, status, created_at) VALUES (?, ?, ?, NULL, ?, ?)',
    ).run('key-run', ACCOUNT_ID, 'dzenteamdev', 'active', '2026-07-12T00:00:00.000Z')
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

function runBody(overrides: Record<string, unknown>): Record<string, unknown> {
    return { install_key: 'key-run', account_id: ACCOUNT_ID, flow_id: OWNED_FLOW, lead_id: 4242, ...overrides }
}

async function postRun(body: unknown): Promise<{ status: number, fetchMock: ReturnType<typeof vi.fn> }> {
    const fetchMock = routedFetch()
    vi.stubGlobal('fetch', fetchMock)
    const app = Fastify()
    registerRun(app)
    const response = await app.inject({ method: 'POST', url: '/run', payload: body as Record<string, unknown> })
    await app.close()
    return { status: response.statusCode, fetchMock }
}

beforeAll(async () => {
    const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
    })
    const dir = mkdtempSync(join(tmpdir(), 'dzenflow-run-test-'))
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
    ;({ registerRun } = await import('./run.js'))
    seedActiveAccount()
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('POST /run', () => {
    it('rejects a missing lead_id with 400', async () => {
        expect((await postRun(runBody({ lead_id: undefined }))).status).toBe(400)
    })

    it('rejects a missing flow_id with 400', async () => {
        expect((await postRun(runBody({ flow_id: '' }))).status).toBe(400)
    })

    it('rejects an unknown binding with 403 before touching the fork', async () => {
        const { status, fetchMock } = await postRun(runBody({ account_id: '999999' }))
        expect(status).toBe(403)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('launches an owned flow with lead_id and manual in the webhook body', async () => {
        const { status, fetchMock } = await postRun(runBody({}))
        expect(status).toBe(200)
        const webhookCall = fetchMock.mock.calls.find(([url]) => String(url).includes(`/api/v1/webhooks/${OWNED_FLOW}`))
        expect(webhookCall).toBeDefined()
        const sentBody = JSON.parse(String((webhookCall?.[1] as { body: string }).body))
        expect(sentBody).toMatchObject({ source: 'amocrm_card', lead_id: '4242', manual: true, account_id: ACCOUNT_ID })
    })

    it('rejects a foreign flow_id with 403 and never launches', async () => {
        const { status, fetchMock } = await postRun(runBody({ flow_id: 'flow-of-another-client' }))
        expect(status).toBe(403)
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/v1/webhooks/'))).toBe(false)
    })
})
