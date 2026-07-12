import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import cors from '@fastify/cors'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { config } from './config.js'
import './db.js'
import { registerDp } from './dp.js'
import { registerEmbedToken } from './embed-token.js'
import { registerFlows } from './flows.js'
import { registerInstall } from './install.js'
import { startPendingLaunchWorker } from './queue.js'
import { registerSalesbot } from './salesbot.js'

const ALLOWED_ORIGIN = /^https:\/\/[a-z0-9][a-z0-9-]*\.amocrm\.ru$/

const WIDGET_STATIC_DIR = resolve(import.meta.dirname, '..', 'static', 'widget')

const STATIC_CONTENT_TYPES: Record<string, string> = {
    js: 'application/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
}

function registerWidgetStatic(app: FastifyInstance): void {
    app.get('/static/widget/:file', async (request, reply) => {
        const { file } = request.params as { file: string }
        const ext = file.includes('.') ? file.slice(file.lastIndexOf('.') + 1) : ''
        const contentType = STATIC_CONTENT_TYPES[ext]
        if (!/^[a-zA-Z0-9._-]+$/.test(file) || contentType === undefined) {
            return reply.code(404).send({ error: 'not found' })
        }
        const path = resolve(WIDGET_STATIC_DIR, file)
        if (path !== WIDGET_STATIC_DIR && !path.startsWith(WIDGET_STATIC_DIR + sep)) {
            return reply.code(404).send({ error: 'not found' })
        }
        const body = await readFile(path).catch(() => null)
        if (body === null) {
            return reply.code(404).send({ error: 'not found' })
        }
        return reply.header('Cache-Control', 'no-cache').type(contentType).send(body)
    })
}

// Секреты моста ездят в query (?k=<DP_SECRET> у dp/salesbot, install_key у flows).
// Дефолтный логгер Fastify пишет полный req.url — режем query, чтобы секрет не
// попал в лог (иначе логи = хранилище действующих ключей).
const app = Fastify({
    logger: {
        serializers: {
            req(request) {
                return {
                    method: request.method,
                    url: request.url.split('?')[0],
                    hostname: request.hostname,
                    remoteAddress: request.ip,
                }
            },
        },
    },
})

await app.register(cors, {
    origin(origin, callback) {
        if (origin === undefined || ALLOWED_ORIGIN.test(origin)) {
            callback(null, true)
            return
        }
        callback(new Error('origin not allowed'), false)
    },
})

// Мост живёт за path-роутером туннеля под /bridge/* — регистрируем все роуты с
// этим префиксом, иначе вызовы виджета (BRIDGE_PUBLIC_URL=.../bridge) упираются
// в 404 (разрыв, замеченный в W010).
await app.register(
    async (instance) => {
        instance.get('/health', async () => ({ status: 'ok' }))
        registerInstall(instance)
        registerEmbedToken(instance)
        registerFlows(instance)
        registerDp(instance)
        registerSalesbot(instance)
        registerWidgetStatic(instance)
    },
    { prefix: '/bridge' },
)

// Дожимает события DP, для которых форк был недоступен в момент вебхука (W017).
startPendingLaunchWorker({ log: app.log })

app.listen({ port: config.port, host: '0.0.0.0' }).catch((error: unknown) => {
    app.log.error(error)
    process.exit(1)
})
