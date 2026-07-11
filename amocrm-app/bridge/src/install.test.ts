import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

let db: typeof import('./db.js').db
let installAccount: typeof import('./install.js').installAccount
let validateInstallBody: typeof import('./install.js').validateInstallBody

function seedPending(installKey: string): void {
    db.prepare(
        'INSERT INTO accounts (install_key, account_id, subdomain, amo_token, status, created_at) VALUES (?, ?, ?, NULL, ?, ?)',
    ).run(installKey, '', '', 'pending', '2026-07-12T00:00:00.000Z')
}

function statusOf(installKey: string): { account_id: string; subdomain: string; status: string } | undefined {
    return db
        .prepare('SELECT account_id, subdomain, status FROM accounts WHERE install_key = ?')
        .get(installKey) as { account_id: string; subdomain: string; status: string } | undefined
}

beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dzenflow-install-test-'))
    process.env.PORT = '8083'
    process.env.FORK_URL = 'https://fork.test'
    process.env.BRIDGE_PUBLIC_URL = 'https://fork.test/bridge'
    process.env.SIGNING_KEY_PATH = join(dir, 'signing-key.pem')
    process.env.SIGNING_KEY_ID = 'test-kid'
    process.env.FORK_API_KEY = 'sk-test'
    process.env.DB_PATH = join(dir, 'bridge.db')

    ;({ db } = await import('./db.js'))
    ;({ installAccount, validateInstallBody } = await import('./install.js'))
})

describe('installAccount', () => {
    it('binds a pending key to the account', () => {
        seedPending('key-pending')
        const result = installAccount({ installKey: 'key-pending', accountId: '32453394', subdomain: 'dzenteamdev' })
        expect(result.ok).toBe(true)
        expect(statusOf('key-pending')).toEqual({ account_id: '32453394', subdomain: 'dzenteamdev', status: 'active' })
    })

    it('is idempotent for the same account', () => {
        seedPending('key-idem')
        installAccount({ installKey: 'key-idem', accountId: '111', subdomain: 'alpha' })
        const second = installAccount({ installKey: 'key-idem', accountId: '111', subdomain: 'alpha' })
        expect(second.ok).toBe(true)
        expect(statusOf('key-idem')?.status).toBe('active')
    })

    it('rejects a key already bound to a different account', () => {
        seedPending('key-taken')
        installAccount({ installKey: 'key-taken', accountId: '111', subdomain: 'alpha' })
        const result = installAccount({ installKey: 'key-taken', accountId: '222', subdomain: 'beta' })
        expect(result.ok).toBe(false)
        expect(statusOf('key-taken')?.account_id).toBe('111')
    })

    it('rejects an unknown key', () => {
        expect(installAccount({ installKey: 'nope', accountId: '111', subdomain: 'alpha' }).ok).toBe(false)
    })

    it('rejects a revoked key', () => {
        db.prepare(
            'INSERT INTO accounts (install_key, account_id, subdomain, amo_token, status, created_at) VALUES (?, ?, ?, NULL, ?, ?)',
        ).run('key-revoked', '111', 'alpha', 'revoked', '2026-07-12T00:00:00.000Z')
        expect(installAccount({ installKey: 'key-revoked', accountId: '111', subdomain: 'alpha' }).ok).toBe(false)
    })
})

describe('validateInstallBody', () => {
    it('accepts a well-formed body and normalizes account_id to string', () => {
        const result = validateInstallBody({ install_key: 'k', account_id: 32453394, subdomain: 'dzenteamdev' })
        expect(result).toEqual({ installKey: 'k', accountId: '32453394', subdomain: 'dzenteamdev' })
    })

    it('rejects a bad subdomain', () => {
        expect('error' in validateInstallBody({ install_key: 'k', account_id: 1, subdomain: 'bad_domain!' })).toBe(true)
        expect('error' in validateInstallBody({ install_key: 'k', account_id: 1, subdomain: '-lead' })).toBe(true)
    })

    it('rejects a non-positive or non-integer account_id', () => {
        expect('error' in validateInstallBody({ install_key: 'k', account_id: 0, subdomain: 'a' })).toBe(true)
        expect('error' in validateInstallBody({ install_key: 'k', account_id: -5, subdomain: 'a' })).toBe(true)
        expect('error' in validateInstallBody({ install_key: 'k', account_id: 1.5, subdomain: 'a' })).toBe(true)
    })

    it('rejects a missing install_key', () => {
        expect('error' in validateInstallBody({ account_id: 1, subdomain: 'a' })).toBe(true)
    })
})
