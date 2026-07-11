// Одноразовый подписыватель embed-JWT для PoC (W003): без сервера, запуск
// `npm run sign-jwt [-- <userId> <firstName> <lastName>]`. Печатает JWT в stdout.
// В W005 логика переезжает в src/jwt.ts.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import jwt from 'jsonwebtoken'

function requireEnv({ name }: { name: string }): string {
    const value = process.env[name]
    if (value === undefined || value === '') {
        throw new Error(`Missing required env var: ${name} (см. env.example)`)
    }
    return value
}

function signEmbedJwt({ externalProjectId, externalUserId, firstName, lastName }: SignEmbedJwtParams): string {
    const keyPath = resolve(import.meta.dirname, '..', requireEnv({ name: 'SIGNING_KEY_PATH' }))
    const privateKey = readFileSync(keyPath, 'utf8')
    const payload = {
        version: 'v3',
        externalUserId,
        externalProjectId,
        firstName,
        lastName,
    }
    return jwt.sign(payload, privateKey, {
        algorithm: 'RS256',
        keyid: requireEnv({ name: 'SIGNING_KEY_ID' }),
        expiresIn: '1h',
    })
}

const [userId = '2898108', firstName = 'Алексей', lastName = 'amoCRM'] = process.argv.slice(2)
const token = signEmbedJwt({
    externalProjectId: '32453394',
    externalUserId: userId,
    firstName,
    lastName,
})
process.stdout.write(`${token}\n`)

type SignEmbedJwtParams = {
    externalProjectId: string
    externalUserId: string
    firstName: string
    lastName: string
}
