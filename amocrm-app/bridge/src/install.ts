import type { FastifyInstance } from 'fastify'
import { db } from './db.js'
import { addAllowedEmbedOrigin } from './fork-client.js'
import { provisionConnection } from './provision-connection.js'

const SUBDOMAIN_RE = /^[a-z0-9][a-z0-9-]{0,62}$/

export function registerInstall(app: FastifyInstance): void {
    app.post('/install', async (request, reply) => {
        const validated = validateInstallBody(request.body)
        if ('error' in validated) {
            return reply.code(400).send({ error: validated.error })
        }
        const result = installAccount(validated)
        if (!result.ok) {
            return reply.code(403).send({ error: 'install rejected' })
        }
        // Ошибка форка не валит install: связка сохранена, origin_synced=0 остаётся
        // в БД для ручного добора; повторный install дожмёт (мерж на форке без дублей).
        const sync = await addAllowedEmbedOrigin({ subdomain: validated.subdomain })
        db.prepare('UPDATE accounts SET origin_synced = ? WHERE install_key = ?').run(
            sync.ok ? 1 : 0,
            validated.installKey,
        )
        if (!sync.ok) {
            request.log.warn({ subdomain: validated.subdomain, reason: sync.reason }, 'allowed-embed-origins не добавлен')
        }
        // Провижининг коннекшена только при наличии amo-токена (задан оператором через
        // set-amo-token). Ошибка форка не валит install — повторный install дожмёт.
        const amoToken = amoTokenOf(validated.installKey)
        if (amoToken !== null) {
            const provisioned = await provisionConnection({
                accountId: validated.accountId,
                subdomain: validated.subdomain,
                amoToken,
            })
            if (!provisioned.ok) {
                request.log.warn({ subdomain: validated.subdomain, reason: provisioned.reason }, 'amocrm-connection не создан')
            }
        }
        return { status: 'active' }
    })
}

export function installAccount({ installKey, accountId, subdomain }: ValidatedInstall): InstallResult {
    const row = db
        .prepare('SELECT account_id AS accountId, status FROM accounts WHERE install_key = ?')
        .get(installKey) as AccountRow | undefined
    if (row === undefined) {
        return { ok: false }
    }
    // Идемпотентность: pending → привязать; активная связка того же аккаунта → подтвердить.
    // Чужой account_id или revoked — отказ, иначе один ключ угонял бы аккаунт другого клиента.
    const boundToSameAccount = row.status === 'active' && row.accountId === accountId
    if (row.status !== 'pending' && !boundToSameAccount) {
        return { ok: false }
    }
    db.prepare('UPDATE accounts SET account_id = ?, subdomain = ?, status = ? WHERE install_key = ?').run(
        accountId,
        subdomain,
        'active',
        installKey,
    )
    return { ok: true }
}

export function validateInstallBody(body: unknown): ValidatedInstall | { error: string } {
    if (typeof body !== 'object' || body === null) {
        return { error: 'invalid body' }
    }
    const record = body as Record<string, unknown>
    const installKey = record.install_key
    if (typeof installKey !== 'string' || installKey === '') {
        return { error: 'install_key required' }
    }
    const accountId = normalizeAccountId(record.account_id)
    if (accountId === null) {
        return { error: 'account_id must be a positive integer' }
    }
    const { subdomain } = record
    if (typeof subdomain !== 'string' || !SUBDOMAIN_RE.test(subdomain)) {
        return { error: 'invalid subdomain' }
    }
    return { installKey, accountId, subdomain }
}

function amoTokenOf(installKey: string): string | null {
    const row = db
        .prepare('SELECT amo_token AS amoToken FROM accounts WHERE install_key = ?')
        .get(installKey) as { amoToken: string | null } | undefined
    const token = row?.amoToken
    return typeof token === 'string' && token !== '' ? token : null
}

function normalizeAccountId(raw: unknown): string | null {
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
    if (!Number.isInteger(value) || value <= 0) {
        return null
    }
    return String(value)
}

type AccountRow = {
    accountId: string
    status: string
}

type InstallResult = {
    ok: boolean
}

export type ValidatedInstall = {
    installKey: string
    accountId: string
    subdomain: string
}
