import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { parseFormBody } from './form-body.js'

let db: typeof import('./db.js').db
let registerDp: typeof import('./dp.js').registerDp

const ACCOUNT_ID = '32453394'
const OWNED_FLOW = 'flow-owned'

beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bridge-form-'))
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const pemPath = join(dir, 'key.pem')
    writeFileSync(pemPath, privateKey.export({ type: 'pkcs1', format: 'pem' }))
    process.env.PORT = '8083'
    process.env.FORK_URL = 'https://fork.test'
    process.env.BRIDGE_PUBLIC_URL = 'https://fork.test/bridge'
    process.env.SIGNING_KEY_PATH = pemPath
    process.env.SIGNING_KEY_ID = 'test-kid'
    process.env.DB_PATH = join(dir, 'bridge.db')
    process.env.FORK_API_KEY = 'sk-test'
    process.env.DP_SECRET = 'dp-secret'
    db = (await import('./db.js')).db
    registerDp = (await import('./dp.js')).registerDp
})

describe('parseFormBody', () => {
    it('раскрывает PHP-скобки в вложенный объект', () => {
        const body = parseFormBody({
            raw: 'account_id=1&event%5Btype%5D=status_changed&event%5Bdata%5D%5Bleads%5D%5B0%5D%5Bid%5D=42&action%5Bsettings%5D%5Bwidget%5D%5Bsettings%5D%5Bflow_id%5D=abc',
        })
        expect(body).toEqual({
            account_id: '1',
            event: { type: 'status_changed', data: { leads: { '0': { id: '42' } } } },
            action: { settings: { widget: { settings: { flow_id: 'abc' } } } },
        })
    })

    it('append-нотация a[] и повторы ключей не теряются', () => {
        const body = parseFormBody({ raw: 'tags%5B%5D=a&tags%5B%5D=b&plain=x' })
        expect(body).toEqual({ tags: { '0': 'a', '1': 'b' }, plain: 'x' })
    })

    it('не загрязняет прототип через __proto__/constructor', () => {
        parseFormBody({ raw: 'a%5B__proto__%5D%5Bpolluted%5D=yes&b%5Bconstructor%5D%5Bx%5D=1' })
        expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    })
})

describe('POST /dp form-urlencoded (реальный формат amo)', () => {
    it('парсится контент-парсером и запускает owned flow', async () => {
        db.prepare(
            'INSERT OR REPLACE INTO accounts (install_key, account_id, subdomain, amo_token, status, created_at) VALUES (?, ?, ?, NULL, ?, ?)',
        ).run('key-form', ACCOUNT_ID, 'dzenteamdev', 'active', '2026-07-12T00:00:00.000Z')

        const fetchMock = vi.fn(async (input: string) => {
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
        vi.stubGlobal('fetch', fetchMock)

        const app = Fastify()
        app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, raw, done) => {
            done(null, parseFormBody({ raw: String(raw) }))
        })
        registerDp(app)

        const response = await app.inject({
            method: 'POST',
            url: `/dp?k=dp-secret`,
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            payload:
                `account_id=${ACCOUNT_ID}&subdomain=dzenteamdev` +
                '&event%5Btype%5D=status_changed&event%5Bdata%5D%5Bleads%5D%5B0%5D%5Bid%5D=38763507' +
                `&action%5Bsettings%5D%5Bwidget%5D%5Bsettings%5D%5Bflow_id%5D=${OWNED_FLOW}`,
        })
        expect(response.statusCode).toBe(200)
        await vi.waitFor(() => {
            const webhook = fetchMock.mock.calls.find(([url]) => String(url).includes('/webhooks/'))
            expect(webhook).toBeDefined()
        })
        vi.unstubAllGlobals()
        await app.close()
    })
})
