import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import { registerMobile } from './mobile.js'

describe('GET /mobile/card', () => {
    it('returns a static HTML page regardless of query params', async () => {
        const app = Fastify()
        registerMobile(app)
        const response = await app.inject({ method: 'GET', url: '/mobile/card?account_id=32453394&lead_id=1' })
        await app.close()
        expect(response.statusCode).toBe(200)
        expect(response.headers['content-type']).toContain('text/html')
        expect(response.body).toContain('веб-версии amoCRM')
        expect(response.body).not.toContain('32453394')
    })
})
