import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

let db: typeof import('./db.js').db
let registerFlows: typeof import('./flows.js').registerFlows

const ACCOUNT_ID = '32453394'

function seedActiveAccount(): void {
    db.prepare(
        'INSERT OR REPLACE INTO accounts (install_key, account_id, subdomain, amo_token, status, created_at) VALUES (?, ?, ?, NULL, ?, ?)',
    ).run('key-flows', ACCOUNT_ID, 'dzenteamdev', 'active', '2026-07-12T00:00:00.000Z')
}

function routedFetch(): ReturnType<typeof vi.fn> {
    return vi.fn(async (input: string) => {
        if (input.includes('/managed-authn/external-token')) {
            return new Response(JSON.stringify({ token: 'sess', projectId: 'proj' }), { status: 200 })
        }
        return new Response(JSON.stringify({
            data: [
                {
                    id: 'flow-webhook',
                    version: {
                        displayName: 'Веб-хук',
                        trigger: { type: 'PIECE_TRIGGER', settings: { pieceName: '@activepieces/piece-webhook', triggerName: 'catch_webhook' } },
                    },
                },
                {
                    id: 'flow-schedule',
                    version: {
                        displayName: 'Расписание',
                        trigger: { type: 'PIECE_TRIGGER', settings: { pieceName: '@activepieces/piece-schedule', triggerName: 'x' } },
                    },
                },
            ],
        }), { status: 200 })
    })
}

async function getFlows(query: string): Promise<{ status: number, body: unknown }> {
    const app = Fastify()
    registerFlows(app)
    const response = await app.inject({ method: 'GET', url: `/flows${query}` })
    await app.close()
    return { status: response.statusCode, body: response.json() }
}

beforeAll(async () => {
    const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
    })
    const dir = mkdtempSync(join(tmpdir(), 'dzenflow-flows-test-'))
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
    ;({ registerFlows } = await import('./flows.js'))
    seedActiveAccount()
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('GET /flows', () => {
    it('rejects a missing install_key with 400', async () => {
        vi.stubGlobal('fetch', routedFetch())
        expect((await getFlows(`?account_id=${ACCOUNT_ID}`)).status).toBe(400)
    })

    it('rejects an unknown account with 403', async () => {
        vi.stubGlobal('fetch', routedFetch())
        expect((await getFlows('?install_key=key-flows&account_id=999999')).status).toBe(403)
    })

    it('returns only webhook-compatible flows for an active account', async () => {
        vi.stubGlobal('fetch', routedFetch())
        const result = await getFlows(`?install_key=key-flows&account_id=${ACCOUNT_ID}`)
        expect(result.status).toBe(200)
        expect(result.body).toEqual([{ id: 'flow-webhook', displayName: 'Веб-хук' }])
    })

    it('returns 502 when the fork is unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
        expect((await getFlows(`?install_key=key-flows&account_id=${ACCOUNT_ID}`)).status).toBe(502)
    })
})
