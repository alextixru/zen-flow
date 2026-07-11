import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import jwt from 'jsonwebtoken'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

let provisionConnection: typeof import('./provision-connection.js').provisionConnection

beforeAll(async () => {
    const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    })
    const dir = mkdtempSync(join(tmpdir(), 'dzenflow-provision-test-'))
    const keyPath = join(dir, 'signing-key.pem')
    writeFileSync(keyPath, privateKey)

    process.env.PORT = '8083'
    process.env.FORK_URL = 'https://fork.test'
    process.env.BRIDGE_PUBLIC_URL = 'https://fork.test/bridge'
    process.env.SIGNING_KEY_PATH = keyPath
    process.env.SIGNING_KEY_ID = 'test-kid'
    process.env.DB_PATH = join(dir, 'bridge.db')
    process.env.FORK_API_KEY = 'sk-test'

    ;({ provisionConnection } = await import('./provision-connection.js'))
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('provisionConnection', () => {
    it('exchanges an Admin JWT then upserts the amocrm connection', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'sess-token', projectId: 'proj-1' }), { status: 200 }))
            .mockResolvedValueOnce(new Response('{}', { status: 201 }))
        vi.stubGlobal('fetch', fetchMock)

        const result = await provisionConnection({ accountId: '32453394', subdomain: 'dzenteamdev', amoToken: 'amo-secret' })

        expect(result).toEqual({ ok: true })
        expect(fetchMock).toHaveBeenCalledTimes(2)

        const [exchangeUrl, exchangeInit] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect(exchangeUrl).toBe('https://fork.test/api/v1/managed-authn/external-token')
        const exchangeBody = JSON.parse(exchangeInit.body as string) as { externalAccessToken: string }
        const claims = jwt.decode(exchangeBody.externalAccessToken) as Record<string, unknown>
        expect(claims.role).toBe('Admin')
        expect(claims.externalProjectId).toBe('32453394')

        const [upsertUrl, upsertInit] = fetchMock.mock.calls[1] as [string, RequestInit]
        expect(upsertUrl).toBe('https://fork.test/api/v1/app-connections')
        expect((upsertInit.headers as Record<string, string>).authorization).toBe('Bearer sess-token')
        expect(JSON.parse(upsertInit.body as string)).toEqual({
            externalId: 'amocrm',
            displayName: 'amoCRM',
            pieceName: '@activepieces/piece-amocrm',
            projectId: 'proj-1',
            type: 'CUSTOM_AUTH',
            value: { type: 'CUSTOM_AUTH', props: { subdomain: 'dzenteamdev', zone: 'amocrm.ru', apiToken: 'amo-secret' } },
        })
    })

    it('stops at the exchange failure without upserting', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }))
        vi.stubGlobal('fetch', fetchMock)

        const result = await provisionConnection({ accountId: '1', subdomain: 'acme', amoToken: 'x' })

        expect(result).toEqual({ ok: false, reason: 'exchange: http 401' })
        expect(fetchMock).toHaveBeenCalledOnce()
    })

    it('reports an upsert failure', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ token: 't', projectId: 'p' }), { status: 200 }))
            .mockResolvedValueOnce(new Response('{}', { status: 400 }))
        vi.stubGlobal('fetch', fetchMock)

        const result = await provisionConnection({ accountId: '1', subdomain: 'acme', amoToken: 'x' })

        expect(result).toEqual({ ok: false, reason: 'upsert: http 400' })
    })
})
