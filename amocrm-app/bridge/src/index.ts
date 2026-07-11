import cors from '@fastify/cors'
import Fastify from 'fastify'
import { config } from './config.js'
import './db.js'
import { registerEmbedToken } from './embed-token.js'
import { registerInstall } from './install.js'

const ALLOWED_ORIGIN = /^https:\/\/[a-z0-9][a-z0-9-]*\.amocrm\.ru$/

const app = Fastify({ logger: true })

await app.register(cors, {
    origin(origin, callback) {
        if (origin === undefined || ALLOWED_ORIGIN.test(origin)) {
            callback(null, true)
            return
        }
        callback(new Error('origin not allowed'), false)
    },
})

app.get('/health', async () => ({ status: 'ok' }))

registerInstall(app)
registerEmbedToken(app)

app.listen({ port: config.port, host: '0.0.0.0' }).catch((error: unknown) => {
    app.log.error(error)
    process.exit(1)
})
