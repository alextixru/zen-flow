// Одноразовый подписыватель embed-JWT для ручных проверок (W003/W005): без
// сервера, запуск `npm run sign-jwt [-- <userId> <firstName> <lastName>]`.
// Печатает JWT в stdout. Логика подписи живёт в src/jwt.ts.
import { signEmbedJwt } from '../src/jwt.js'

const [userId = '2898108', firstName = 'Алексей', lastName = 'amoCRM'] = process.argv.slice(2)
const token = signEmbedJwt({
    accountId: '32453394',
    subdomain: 'dzenteamdev',
    user: { id: userId, firstName, lastName },
})
process.stdout.write(`${token}\n`)
