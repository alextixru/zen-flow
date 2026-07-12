import type { FastifyInstance } from 'fastify'

const MOBILE_CARD_HTML = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dzen Flow</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 24px 16px; color: #313942; }
  p { line-height: 1.4; }
</style>
</head>
<body>
<p>Полный конструктор автоматизаций Dzen Flow доступен в веб-версии amoCRM.</p>
<p>Откройте карточку сделки с компьютера, чтобы запускать и просматривать автоматизации.</p>
</body>
</html>`

export function registerMobile(app: FastifyInstance): void {
    app.get('/mobile/card', async (request, reply) => {
        // Контракт mobile.frame_url не задокументирован (RESEARCH открытый вопрос №4) —
        // логируем всё, что реально прилетает от amo, чтобы зафиксировать в activity.
        request.log.info({ query: request.query, headers: request.headers }, 'mobile/card: incoming request')
        return reply.type('text/html; charset=utf-8').send(MOBILE_CARD_HTML)
    })
}
