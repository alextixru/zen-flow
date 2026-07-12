import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import jwt from 'jsonwebtoken'
import { beforeAll, describe, expect, it } from 'vitest'

let db: typeof import('./db.js').db
let issueEmbedToken: typeof import('./embed-token.js').issueEmbedToken
let rateLimitExceeded: typeof import('./embed-token.js').rateLimitExceeded
let splitName: typeof import('./embed-token.js').splitName
let validateEmbedTokenBody: typeof import('./embed-token.js').validateEmbedTokenBody
let publicKey: string

function seedAccount({ installKey, accountId, status }: { installKey: string; accountId: string; status: string }): void {
    db.prepare(
        'INSERT INTO accounts (install_key, account_id, subdomain, amo_token, status, created_at) VALUES (?, ?, ?, NULL, ?, ?)',
    ).run(installKey, accountId, 'dzenteamdev', status, '2026-07-12T00:00:00.000Z')
}

function decode(token: string): jwt.JwtPayload {
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] })
    if (typeof decoded === 'string') {
        throw new Error('unexpected string payload')
    }
    return decoded
}

beforeAll(async () => {
    const { publicKey: pub, privateKey: priv } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    })
    publicKey = pub

    const dir = mkdtempSync(join(tmpdir(), 'dzenflow-embed-token-test-'))
    const keyPath = join(dir, 'signing-key.pem')
    writeFileSync(keyPath, priv)

    process.env.PORT = '8083'
    process.env.FORK_URL = 'https://fork.test'
    process.env.BRIDGE_PUBLIC_URL = 'https://fork.test/bridge'
    process.env.SIGNING_KEY_PATH = keyPath
    process.env.SIGNING_KEY_ID = 'test-kid'
    process.env.FORK_API_KEY = 'sk-test'
    process.env.DP_SECRET = 'dp-test-secret'
    process.env.DB_PATH = join(dir, 'bridge.db')

    ;({ db } = await import('./db.js'))
    ;({ issueEmbedToken, rateLimitExceeded, splitName, validateEmbedTokenBody } = await import('./embed-token.js'))
})

describe('issueEmbedToken', () => {
    it('signs a JWT with claims from the DB row, not the request', () => {
        seedAccount({ installKey: 'key-active', accountId: '32453394', status: 'active' })
        const result = issueEmbedToken({
            installKey: 'key-active',
            accountId: '32453394',
            user: { id: '2898108', name: 'Алексей Тихонов' },
        })
        if (!result.ok) {
            throw new Error('expected ok')
        }
        const claims = decode(result.jwtToken)
        expect(claims.version).toBe('v3')
        expect(claims.externalProjectId).toBe('32453394')
        expect(claims.externalUserId).toBe('2898108')
        expect(claims.firstName).toBe('Алексей')
        expect(claims.lastName).toBe('Тихонов')
        expect(claims.projectDisplayName).toBe('dzenteamdev')
        expect(claims.role).toBe('Editor')
        expect(claims.piecesFilterType).toBe('ALLOWED')
        expect(claims.piecesTags).toEqual(['ru-allowed'])
        const nowSeconds = Math.floor(Date.now() / 1000)
        expect(claims.exp).toBeGreaterThan(nowSeconds + 3500)
        expect(claims.exp).toBeLessThanOrEqual(nowSeconds + 3600)
    })

    it('rejects an unknown key', () => {
        expect(issueEmbedToken({ installKey: 'nope', accountId: '1', user: { id: '1', name: '' } }).ok).toBe(false)
    })

    it('rejects a revoked key', () => {
        seedAccount({ installKey: 'key-revoked', accountId: '111', status: 'revoked' })
        expect(issueEmbedToken({ installKey: 'key-revoked', accountId: '111', user: { id: '1', name: '' } }).ok).toBe(false)
    })

    it('rejects a pending (not yet installed) key', () => {
        seedAccount({ installKey: 'key-pending', accountId: '', status: 'pending' })
        expect(issueEmbedToken({ installKey: 'key-pending', accountId: '111', user: { id: '1', name: '' } }).ok).toBe(false)
    })

    it('rejects a key bound to a different account', () => {
        seedAccount({ installKey: 'key-other', accountId: '111', status: 'active' })
        expect(issueEmbedToken({ installKey: 'key-other', accountId: '222', user: { id: '1', name: '' } }).ok).toBe(false)
    })
})

describe('splitName', () => {
    it('splits on the first space', () => {
        expect(splitName('Иван Петров Сидоров')).toEqual({ firstName: 'Иван', lastName: 'Петров Сидоров' })
    })

    it('falls back per part when name is empty or single-word', () => {
        expect(splitName('')).toEqual({ firstName: 'amoCRM', lastName: 'User' })
        expect(splitName('Иван')).toEqual({ firstName: 'Иван', lastName: 'User' })
    })
})

describe('rateLimitExceeded', () => {
    it('allows 30 requests per window and rejects the 31st', () => {
        const now = 1_000_000
        for (let i = 0; i < 30; i++) {
            expect(rateLimitExceeded({ installKey: 'rl-key', now })).toBe(false)
        }
        expect(rateLimitExceeded({ installKey: 'rl-key', now })).toBe(true)
    })

    it('resets after the window elapses', () => {
        const now = 2_000_000
        for (let i = 0; i < 31; i++) {
            rateLimitExceeded({ installKey: 'rl-reset', now })
        }
        expect(rateLimitExceeded({ installKey: 'rl-reset', now: now + 60_000 })).toBe(false)
    })

    it('tracks keys independently', () => {
        const now = 3_000_000
        for (let i = 0; i < 31; i++) {
            rateLimitExceeded({ installKey: 'rl-a', now })
        }
        expect(rateLimitExceeded({ installKey: 'rl-b', now })).toBe(false)
    })
})

describe('validateEmbedTokenBody', () => {
    it('accepts a well-formed body and normalizes ids to strings', () => {
        const result = validateEmbedTokenBody({
            install_key: 'k',
            account_id: 32453394,
            user: { id: '2898108', name: 'Иван' },
        })
        expect(result).toEqual({ installKey: 'k', accountId: '32453394', user: { id: '2898108', name: 'Иван' } })
    })

    it('defaults a missing user.name to an empty string', () => {
        const result = validateEmbedTokenBody({ install_key: 'k', account_id: 1, user: { id: 2 } })
        expect(result).toEqual({ installKey: 'k', accountId: '1', user: { id: '2', name: '' } })
    })

    it('rejects a missing install_key, account_id or user.id', () => {
        expect('error' in validateEmbedTokenBody({ account_id: 1, user: { id: 1 } })).toBe(true)
        expect('error' in validateEmbedTokenBody({ install_key: 'k', user: { id: 1 } })).toBe(true)
        expect('error' in validateEmbedTokenBody({ install_key: 'k', account_id: 1 })).toBe(true)
        expect('error' in validateEmbedTokenBody({ install_key: 'k', account_id: 1, user: { id: 0 } })).toBe(true)
    })
})
