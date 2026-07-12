import type { FastifyInstance } from 'fastify'
import { config } from './config.js'
import { activeSubdomain, launchOwnedFlow, normalizeAccountId } from './flow-launch.js'

export function registerSalesbot(app: FastifyInstance): void {
    app.post('/salesbot', async (request, reply) => {
        const query = request.query as Record<string, unknown>
        // Как у /dp: подписи у amo нет, статический ?k в query — наш максимум.
        if (typeof query.k !== 'string' || query.k !== config.dpSecret) {
            return reply.code(403).send({ error: 'forbidden' })
        }
        const payload = parseSalesbotPayload(request.body)
        if (payload === null) {
            // Только ключи, не значения: тело amo несёт JWT (token) — не в лог.
            const keys = typeof request.body === 'object' && request.body !== null
                ? Object.keys(request.body as Record<string, unknown>)
                : []
            request.log.warn({ bodyKeys: keys }, 'salesbot: invalid payload')
            return reply.code(400).send({ error: 'invalid payload' })
        }
        if (activeSubdomain(payload.accountId) === null) {
            return reply.code(403).send({ error: 'unknown account' })
        }
        // .catch обязателен: необработанный reject уронил бы процесс моста
        // целиком (unhandledRejection).
        launchOwnedFlow({
            accountId: payload.accountId,
            flowId: payload.flowId,
            source: 'amocrm_salesbot',
            log: request.log,
        }).catch((error: unknown) => {
            request.log.error(error, 'salesbot: async launch failed')
        })
        // «Выстрелил и забыл»: точный формат ответа salesbot для выбора exit не
        // восстановлен из референса и не проверен живьём (escape W016), поэтому
        // ветвление по результату flow — upgrade. Пустой список шагов = боту
        // ничего не дослать, он продолжает сценарий (exits в манифесте пусты).
        // ponytail: вернуть выбор exit, когда формат подтвердится на установке.
        return reply.code(200).send([])
    })
}

// Виджет собирает поля в onSalesbotDesignerSave (data = {flow_id, account_id,
// subdomain}), но amo при widget_request оборачивает их в тело
// {token, data:{...}, return_url} (снято живьём 2026-07-12). Читаем из data,
// с fallback на корень — устойчиво к обеим формам.
export function parseSalesbotPayload(body: unknown): SalesbotPayload | null {
    if (typeof body !== 'object' || body === null) {
        return null
    }
    const outer = body as Record<string, unknown>
    const inner = typeof outer.data === 'object' && outer.data !== null
        ? outer.data as Record<string, unknown>
        : outer
    const accountId = normalizeAccountId(inner.account_id)
    if (accountId === null) {
        return null
    }
    const flowId = typeof inner.flow_id === 'string' && inner.flow_id !== '' ? inner.flow_id : null
    if (flowId === null) {
        return null
    }
    return { accountId, flowId }
}

export type SalesbotPayload = { accountId: string, flowId: string }
