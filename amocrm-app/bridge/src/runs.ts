import type { FastifyInstance } from 'fastify'
import { activeAccount, getRecentRuns, validateFlowsQuery } from './flows.js'

// Раны проекта, НЕ сделки: ран не знает lead_id (честное ограничение MVP W018).
const RUNS_LIMIT = 10

export function registerRuns(app: FastifyInstance): void {
    app.get('/runs', async (request, reply) => {
        const validated = validateFlowsQuery(request.query)
        if ('error' in validated) {
            return reply.code(400).send({ error: validated.error })
        }
        const account = activeAccount(validated)
        if (account === null) {
            return reply.code(403).send({ error: 'unknown account' })
        }
        const result = await getRecentRuns({
            accountId: validated.accountId,
            subdomain: account.subdomain,
            now: Date.now(),
            limit: RUNS_LIMIT,
        })
        if (!result.ok) {
            request.log.warn({ accountId: validated.accountId, reason: result.reason }, 'runs listing failed')
            return reply.code(502).send({ error: 'fork unavailable' })
        }
        return result.runs
    })
}
