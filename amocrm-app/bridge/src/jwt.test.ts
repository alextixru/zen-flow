import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import jwt from 'jsonwebtoken'
import { beforeAll, describe, expect, it } from 'vitest'

let signEmbedJwt: typeof import('./jwt.js').signEmbedJwt
let publicKey: string
const signingKeyId = 'test-kid'

beforeAll(async () => {
    const { publicKey: pub, privateKey: priv } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    })
    publicKey = pub

    const dir = mkdtempSync(join(tmpdir(), 'dzenflow-jwt-test-'))
    const keyPath = join(dir, 'signing-key.pem')
    writeFileSync(keyPath, priv)

    process.env.PORT = '8083'
    process.env.FORK_URL = 'https://fork.test'
    process.env.BRIDGE_PUBLIC_URL = 'https://fork.test/bridge'
    process.env.SIGNING_KEY_PATH = keyPath
    process.env.SIGNING_KEY_ID = signingKeyId
    process.env.DB_PATH = join(dir, 'bridge.db')

    ;({ signEmbedJwt } = await import('./jwt.js'))
})

describe('signEmbedJwt', () => {
    it('signs a v3 embed JWT with the expected header and claims', () => {
        const token = signEmbedJwt({
            accountId: '32453394',
            subdomain: 'dzenteamdev',
            user: { id: '2898108', firstName: 'Алексей', lastName: 'amoCRM' },
        })

        const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] })
        if (typeof decoded === 'string') {
            throw new Error('unexpected string payload')
        }

        expect(decoded.version).toBe('v3')
        expect(decoded.externalUserId).toBe('2898108')
        expect(decoded.externalProjectId).toBe('32453394')
        expect(decoded.firstName).toBe('Алексей')
        expect(decoded.lastName).toBe('amoCRM')
        expect(decoded.projectDisplayName).toBe('dzenteamdev')
        expect(decoded.piecesFilterType).toBeUndefined()

        const header = jwt.decode(token, { complete: true })?.header
        expect(header?.alg).toBe('RS256')
        expect(header?.kid).toBe(signingKeyId)

        const nowSeconds = Math.floor(Date.now() / 1000)
        expect(decoded.exp).toBeGreaterThan(nowSeconds + 3500)
        expect(decoded.exp).toBeLessThanOrEqual(nowSeconds + 3600)
    })

    it('includes piecesFilterType/piecesTags only when tags are passed', () => {
        const token = signEmbedJwt({
            accountId: '32453394',
            subdomain: 'dzenteamdev',
            user: { id: '2898108', firstName: 'Алексей', lastName: 'amoCRM' },
            piecesTags: ['ru-allowed'],
        })
        const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] })
        if (typeof decoded === 'string') {
            throw new Error('unexpected string payload')
        }

        expect(decoded.piecesFilterType).toBe('ALLOWED')
        expect(decoded.piecesTags).toEqual(['ru-allowed'])
    })
})
