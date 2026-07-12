import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

let db: typeof import('./db.js').db
let registerRuns: typeof import('./runs.js').registerRuns

const ACCOUNT_ID = '32453394'

function seedActiveAccount(): void {
    db.prepare(
        'INSERT OR REPLACE INTO accounts (install_key, account_id, subdomain, amo_token, status, created_at) VALUES (?, ?, ?, NULL, ?, ?)',
    ).run('key-runs', ACCOUNT_ID, 'dzenteamdev', 'active', '2026-07-12T00:00:00.000Z')
}

function routedFetch(): ReturnType<typeof vi.fn> {
    return vi.fn(async (input: string) => {
        if (input.includes('/managed-authn/external-token')) {
            return new Response(JSON.stringify({ token: 'sess', projectId: 'proj' }), { status: 200 })
        }
        return new Response(JSON.stringify({
            data: [
                {
                    id: 'run-1',
                    flowId: 'flow-webhook',
                    status: 'SUCCEEDED',
                    created: '2026-07-12T01:00:00.000Z',
                    flowVersion: { displayName: 'Веб-хук' },
                },
                {
                    id: 'run-2',
                    flowId: 'flow-webhook',
                    status: 'FAILED',
                    startTime: '2026-07-12T00:30:00.000Z',
                },
            ],
        }), { status: 200 })
    })
}

async function getRuns(query: string): Promise<{ status: number, body: unknown }> {
    const app = Fastify()
    registerRuns(app)
    const response = await app.inject({ method: 'GET', url: `/runs${query}` })
    await app.close()
    return { status: response.statusCode, body: response.json() }
}

beforeAll(async () => {
    const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
    })
    const dir = mkdtempSync(join(tmpdir(), 'dzenflow-runs-test-'))
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
    ;({ registerRuns } = await import('./runs.js'))
    seedActiveAccount()
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('GET /runs', () => {
    it('rejects a missing install_key with 400', async () => {
        vi.stubGlobal('fetch', routedFetch())
        expect((await getRuns(`?account_id=${ACCOUNT_ID}`)).status).toBe(400)
    })

    it('rejects an unknown account with 403', async () => {
        vi.stubGlobal('fetch', routedFetch())
        expect((await getRuns('?install_key=key-runs&account_id=999999')).status).toBe(403)
    })

    it('returns flattened recent runs for an active account', async () => {
        vi.stubGlobal('fetch', routedFetch())
        const result = await getRuns(`?install_key=key-runs&account_id=${ACCOUNT_ID}`)
        expect(result.status).toBe(200)
        expect(result.body).toEqual([
            { id: 'run-1', flowId: 'flow-webhook', displayName: 'Веб-хук', status: 'SUCCEEDED', created: '2026-07-12T01:00:00.000Z' },
            { id: 'run-2', flowId: 'flow-webhook', displayName: 'flow-webhook', status: 'FAILED', created: '2026-07-12T00:30:00.000Z' },
        ])
    })

    it('returns 502 when the fork is unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
        expect((await getRuns(`?install_key=key-runs&account_id=${ACCOUNT_ID}`)).status).toBe(502)
    })
})
