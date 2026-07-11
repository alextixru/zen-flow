// Тегирует тегом ru-allowed весь ALLOWED-каталог pieces (research/pieces-ru-audit.md
// §«Черновой ALLOWED-список для embedding»). openai/claude намеренно исключены — требуют
// прокси для трафика из РФ, конфликт с self-hosting.md (zero-setup); deepseek остаётся.
// Идемпотентно: POST /v1/tags/pieces полностью заменяет набор тегов piece'а на переданный,
// повторный запуск безопасен. Запуск: npm run tag-pieces
import { setPieceTags } from '../src/fork-client.js'

const TAG = 'ru-allowed'
const NO_PROXY_EXCLUDED = new Set(['openai', 'claude'])

const CORE_PIECE_SLUGS = [
    'http', 'webhook', 'schedule', 'delay', 'forms', 'approval', 'csv', 'json', 'xml',
    'text-helper', 'date-helper', 'math-helper', 'file-helper', 'image-helper', 'pdf',
    'qrcode', 'crypto', 'store', 'tables', 'tags', 'subflows', 'smtp', 'graphql', 'sftp',
    'data-mapper', 'data-summarizer', 'manual-trigger', 'connections',
]

const COMMUNITY_PIECE_SLUGS = [
    'amocrm', 'kommo', 'telegram-bot', 'whatsapp', 'gmail', 'google-sheets', 'google-drive',
    'google-docs', 'google-calendar', 'google-forms', 'google-contacts', 'openai', 'claude',
    'google-gemini', 'deepseek', 'groq', 'mistral-ai', 'typeform', 'jotform', 'cal-com',
    'calendly', 'canva', 'woocommerce', 'wordpress', 'webflow', 'zoom', 'dropbox', 'box',
    'mongodb', 'postgres', 'mysql', 'monday', 'smartsheet', 'github', 'gitlab', 'twitter',
    'reddit', 'bitly', 'asana', 'clickup', 'pipedrive', 'zoho-crm', 'zoho-mail', 'postmark',
    'sendpulse',
]

const pieceNames = [...CORE_PIECE_SLUGS, ...COMMUNITY_PIECE_SLUGS]
    .filter((slug) => !NO_PROXY_EXCLUDED.has(slug))
    .map((slug) => `@activepieces/piece-${slug}`)

const result = await setPieceTags({ pieceNames, tag: TAG })
if (!result.ok) {
    process.stderr.write(`tag-pieces failed: ${result.reason}\n`)
    process.exit(1)
}
process.stdout.write(`tagged ${pieceNames.length} pieces with ${TAG}\n`)
