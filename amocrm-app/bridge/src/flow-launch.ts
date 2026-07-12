import type { FastifyBaseLogger } from 'fastify'
import { db } from './db.js'
import { getEnabledFlows } from './flows.js'
import { runFlowWebhook } from './fork-client.js'

// Общий запуск flow по событию amo (DP / salesbot). Клиенту amo ответ уже
// отправлен — эта работа идёт после reply, ошибки только логируются.
// Проверка принадлежности flow аккаунту — единственная защита от cross-tenant
// (подмена settings шага чужим flow_id), поэтому живёт в одном месте на оба пути.
export async function launchOwnedFlow({ accountId, flowId, source, extra, log }: LaunchParams): Promise<void> {
    const account = activeSubdomain(accountId)
    if (account === null) {
        return
    }
    const flows = await getEnabledFlows({ accountId, subdomain: account.subdomain, now: Date.now() })
    if (!flows.ok) {
        log.warn({ accountId, source, reason: flows.reason }, 'launch: flow listing failed')
        return
    }
    if (!flows.flows.some((flow) => flow.id === flowId)) {
        log.warn({ accountId, source, flowId }, 'launch: flow_id not owned by account')
        return
    }
    const run = await runFlowWebhook({
        flowId,
        body: { source, account_id: accountId, subdomain: account.subdomain, ...extra },
    })
    if (!run.ok) {
        log.warn({ accountId, source, flowId, reason: run.reason }, 'launch: flow launch failed')
        return
    }
    log.info({ accountId, source, flowId }, 'launch: flow launched')
}

export function activeSubdomain(accountId: string): { subdomain: string } | null {
    const row = db
        .prepare('SELECT subdomain FROM accounts WHERE account_id = ? AND status = ?')
        .get(accountId, 'active') as { subdomain: string } | undefined
    return row ?? null
}

export function normalizeAccountId(raw: unknown): string | null {
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
    if (!Number.isInteger(value) || value <= 0) {
        return null
    }
    return String(value)
}

export type LaunchParams = {
    accountId: string
    flowId: string
    source: string
    extra?: Record<string, unknown>
    log: FastifyBaseLogger
}
