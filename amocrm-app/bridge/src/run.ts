import type { FastifyInstance } from 'fastify'
import { activeAccount } from './flows.js'
import { launchOwnedFlow, normalizeAccountId } from './flow-launch.js'

// Ручной запуск flow с карточки сделки. В отличие от /dp (вебхук amo без ключа)
// клиент присылает install_key — сверяем именно связку, затем launchOwnedFlow
// проверяет принадлежность flow аккаунту (cross-tenant). Действие синхронное:
// ждём исход и возвращаем реальный статус (карточке нужен ответ, не мгновенный 200).
export function registerRun(app: FastifyInstance): void {
    app.post('/run', async (request, reply) => {
        const parsed = parseRunBody(request.body)
        if ('error' in parsed) {
            return reply.code(400).send({ error: parsed.error })
        }
        if (activeAccount({ installKey: parsed.installKey, accountId: parsed.accountId }) === null) {
            return reply.code(403).send({ error: 'unknown account' })
        }
        const outcome = await launchOwnedFlow({
            accountId: parsed.accountId,
            flowId: parsed.flowId,
            source: 'amocrm_card',
            extra: { lead_id: parsed.leadId, manual: true },
            log: request.log,
        })
        if (outcome.status === 'launched') {
            return reply.code(200).send({ status: 'launched' })
        }
        if (outcome.status === 'not_owned' || outcome.status === 'unknown_account') {
            return reply.code(403).send({ error: 'forbidden' })
        }
        return reply.code(502).send({ error: 'fork unavailable' })
    })
}

function parseRunBody(body: unknown): ParsedRunBody | { error: string } {
    if (typeof body !== 'object' || body === null) {
        return { error: 'invalid payload' }
    }
    const record = body as Record<string, unknown>
    if (typeof record.install_key !== 'string' || record.install_key === '') {
        return { error: 'install_key required' }
    }
    const accountId = normalizeAccountId(record.account_id)
    if (accountId === null) {
        return { error: 'account_id must be a positive integer' }
    }
    if (typeof record.flow_id !== 'string' || record.flow_id === '') {
        return { error: 'flow_id required' }
    }
    const leadId = normalizeAccountId(record.lead_id)
    if (leadId === null) {
        return { error: 'lead_id must be a positive integer' }
    }
    return { installKey: record.install_key, accountId, flowId: record.flow_id, leadId }
}

type ParsedRunBody = { installKey: string, accountId: string, flowId: string, leadId: string }
