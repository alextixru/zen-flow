import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { config } from './config.js'
import { activeSubdomain, launchOwnedFlow, normalizeAccountId } from './flow-launch.js'
import { computeEventKey, enqueuePendingLaunch, markEventOnce } from './queue.js'

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
        // .catch обязателен: необработанный reject (например, ошибка sqlite в
        // дедупе) уронил бы процесс моста целиком (unhandledRejection).
        handleDpEvent({ payload, log: request.log }).catch((error: unknown) => {
            request.log.error(error, 'dp: async launch failed')
        })
        return reply
    })
}

// Дедуп + запуск flow, вынесено из хендлера — amo ретраит DP-вебхук на
// таймаут/не-200 (W017 §а), а форк может быть временно недоступен: дедуп по
// event_key не даёт повторного запуска, 'unreachable' уходит в очередь ретраев.
async function handleDpEvent({ payload, log }: { payload: DpPayload, log: FastifyBaseLogger }): Promise<void> {
    const now = Date.now()
    const eventKey = computeEventKey({ accountId: payload.accountId, flowId: payload.flowId, event: payload.event })
    if (!markEventOnce({ eventKey, now })) {
        log.info({ accountId: payload.accountId, flowId: payload.flowId }, 'dp: duplicate event dropped')
        return
    }
    const outcome = await launchOwnedFlow({
        accountId: payload.accountId,
        flowId: payload.flowId,
        source: 'amocrm_dp',
        extra: { event: payload.event },
        log,
    })
    if (outcome.status === 'unreachable') {
        enqueuePendingLaunch({
            eventKey,
            accountId: payload.accountId,
            flowId: payload.flowId,
            source: 'amocrm_dp',
            extra: { event: payload.event },
            now,
        })
        log.warn({ accountId: payload.accountId, flowId: payload.flowId, reason: outcome.reason }, 'dp: fork unreachable, queued for retry')
    }
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
