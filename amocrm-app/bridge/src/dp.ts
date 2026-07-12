import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { config } from './config.js'
import { db } from './db.js'
import { getEnabledFlows } from './flows.js'
import { runFlowWebhook } from './fork-client.js'

export function registerDp(app: FastifyInstance): void {
    app.post('/dp', async (request, reply) => {
        const query = request.query as Record<string, unknown>
        // Подписи у amo DP-вебхука нет — статический ?k в query это наш максимум.
        if (typeof query.k !== 'string' || query.k !== config.dpSecret) {
            return reply.code(403).send({ error: 'forbidden' })
        }
        const payload = parseDpPayload(request.body)
        if (payload === null) {
            return reply.code(400).send({ error: 'invalid payload' })
        }
        if (activeAccountExists(payload.accountId) === false) {
            return reply.code(403).send({ error: 'unknown account' })
        }
        // amo ждёт быстрый 200 — запуск flow идёт после отправки ответа.
        void reply.code(200).send({ status: 'accepted' })
        void launchFlow({ payload, log: request.log })
        return reply
    })
}

async function launchFlow({ payload, log }: { payload: DpPayload, log: FastifyBaseLogger }): Promise<void> {
    const account = subdomainOf(payload.accountId)
    if (account === null) {
        return
    }
    const flows = await getEnabledFlows({ accountId: payload.accountId, subdomain: account.subdomain, now: Date.now() })
    if (!flows.ok) {
        log.warn({ accountId: payload.accountId, reason: flows.reason }, 'dp: flow listing failed')
        return
    }
    // Чужой flow_id отбрасываем: подмена settings шага не должна запускать flow другого клиента.
    const owned = flows.flows.some((flow) => flow.id === payload.flowId)
    if (!owned) {
        log.warn({ accountId: payload.accountId, flowId: payload.flowId }, 'dp: flow_id not owned by account')
        return
    }
    const run = await runFlowWebhook({
        flowId: payload.flowId,
        body: { source: 'amocrm_dp', event: payload.event, account_id: payload.accountId, subdomain: account.subdomain },
    })
    if (!run.ok) {
        log.warn({ accountId: payload.accountId, flowId: payload.flowId, reason: run.reason }, 'dp: flow launch failed')
        return
    }
    log.info({ accountId: payload.accountId, flowId: payload.flowId }, 'dp: flow launched')
}

// Форма payload — справочник PRD (DP-блок): flow_id в action.settings.widget.settings.
export function parseDpPayload(body: unknown): DpPayload | null {
    if (typeof body !== 'object' || body === null) {
        return null
    }
    const record = body as Record<string, unknown>
    const accountId = normalizeAccountId(record.account_id)
    if (accountId === null) {
        return null
    }
    const flowId = extractFlowId(record.action)
    if (flowId === null) {
        return null
    }
    const event = typeof record.event === 'object' && record.event !== null ? record.event : {}
    return { accountId, flowId, event }
}

function extractFlowId(action: unknown): string | null {
    const settings = digObject(digObject(digObject(action, 'settings'), 'widget'), 'settings')
    const flowId = settings?.flow_id
    return typeof flowId === 'string' && flowId !== '' ? flowId : null
}

function digObject(value: unknown, key: string): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null) {
        return null
    }
    const nested = (value as Record<string, unknown>)[key]
    return typeof nested === 'object' && nested !== null ? nested as Record<string, unknown> : null
}

function activeAccountExists(accountId: string): boolean {
    return subdomainOf(accountId) !== null
}

function subdomainOf(accountId: string): { subdomain: string } | null {
    const row = db
        .prepare('SELECT subdomain FROM accounts WHERE account_id = ? AND status = ?')
        .get(accountId, 'active') as { subdomain: string } | undefined
    return row ?? null
}

function normalizeAccountId(raw: unknown): string | null {
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
    if (!Number.isInteger(value) || value <= 0) {
        return null
    }
    return String(value)
}

export type DpPayload = { accountId: string, flowId: string, event: unknown }
