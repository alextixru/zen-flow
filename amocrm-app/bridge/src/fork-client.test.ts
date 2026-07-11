import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

let db: typeof import('./db.js').db
let addAllowedEmbedOrigin: typeof import('./fork-client.js').addAllowedEmbedOrigin
let registerInstall: typeof import('./install.js').registerInstall

function seedPending(installKey: string): void {
    db.prepare(
        'INSERT INTO accounts (install_key, account_id, subdomain, amo_token, status, created_at) VALUES (?, ?, ?, NULL, ?, ?)',
    ).run(installKey, '', '', 'pending', '2026-07-12T00:00:00.000Z')
}

function originSyncedOf(installKey: string): number | undefined {
    const row = db
        .prepare('SELECT origin_synced FROM accounts WHERE install_key = ?')
        .get(installKey) as { origin_synced: number } | undefined
    return row?.origin_synced
}

beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dzenflow-fork-client-test-'))
    process.env.PORT = '8083'
    process.env.FORK_URL = 'https://fork.test'
    process.env.BRIDGE_PUBLIC_URL = 'https://fork.test/bridge'
    process.env.SIGNING_KEY_PATH = join(dir, 'signing-key.pem')
    process.env.SIGNING_KEY_ID = 'test-kid'
    process.env.DB_PATH = join(dir, 'bridge.db')
    process.env.FORK_API_KEY = 'sk-test'

    ;({ db } = await import('./db.js'))
    ;({ addAllowedEmbedOrigin } = await import('./fork-client.js'))
    ;({ registerInstall } = await import('./install.js'))
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('addAllowedEmbedOrigin', () => {
    it('POSTs the merged origin to the fork with the service api key', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
        vi.stubGlobal('fetch', fetchMock)

        const result = await addAllowedEmbedOrigin({ subdomain: 'acme' })

        expect(result).toEqual({ ok: true })
        expect(fetchMock).toHaveBeenCalledOnce()
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect(url).toBe('https://fork.test/api/v1/embed-subdomain/allowed-embed-origins')
        expect(init.method).toBe('POST')
        expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test')
        expect(JSON.parse(init.body as string)).toEqual({ allowedEmbedOrigins: ['https://acme.amocrm.ru'] })
    })

    it('reports http status on a non-ok response', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })))
        expect(await addAllowedEmbedOrigin({ subdomain: 'acme' })).toEqual({ ok: false, reason: 'http 403' })
    })

    it('reports network error when fetch throws', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))
        expect(await addAllowedEmbedOrigin({ subdomain: 'acme' })).toEqual({ ok: false, reason: 'network error' })
    })
})

describe('POST /install origin sync', () => {
    async function postInstall(installKey: string): Promise<number> {
        const app = Fastify()
        registerInstall(app)
        const response = await app.inject({
            method: 'POST',
            url: '/install',
            payload: { install_key: installKey, account_id: 32453394, subdomain: 'dzenteamdev' },
        })
        await app.close()
        return response.statusCode
    }

    it('marks origin_synced=1 when the fork call succeeds', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })))
        seedPending('key-sync-ok')
        expect(await postInstall('key-sync-ok')).toBe(200)
        expect(originSyncedOf('key-sync-ok')).toBe(1)
    })

    it('keeps install successful with origin_synced=0 when the fork call fails', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fork down')))
        seedPending('key-sync-fail')
        expect(await postInstall('key-sync-fail')).toBe(200)
        expect(originSyncedOf('key-sync-fail')).toBe(0)
    })
})
