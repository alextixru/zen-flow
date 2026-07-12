import type { FastifyInstance } from 'fastify'
import { config } from './config.js'
import { activeSubdomain, launchOwnedFlow, normalizeAccountId } from './flow-launch.js'

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
        if (activeSubdomain(payload.accountId) === null) {
            return reply.code(403).send({ error: 'unknown account' })
        }
        // amo ждёт быстрый 200 — запуск flow идёт после отправки ответа.
        void reply.code(200).send({ status: 'accepted' })
        void launchOwnedFlow({
            accountId: payload.accountId,
            flowId: payload.flowId,
            source: 'amocrm_dp',
            extra: { event: payload.event },
            log: request.log,
        })
        return reply
    })
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

export type DpPayload = { accountId: string, flowId: string, event: unknown }
