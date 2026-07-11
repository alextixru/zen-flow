import { exchangeExternalToken, upsertAmocrmConnection } from './fork-client.js'
import { signEmbedJwt } from './jwt.js'

// Мост провижинит amocrm-connection «сам за себя»: подписывает Admin-JWT
// системного пользователя (не реального embed-юзера — чтобы не менять его роль),
// обменивает на project-сессию и апсертит коннекшен. Идемпотентность — externalId
// 'amocrm' на стороне форка. Токен amoCRM в reason/лог не попадает.
export async function provisionConnection({ accountId, subdomain, amoToken }: ProvisionParams): Promise<ProvisionResult> {
    const jwtToken = signEmbedJwt({
        accountId,
        subdomain,
        user: { id: PROVISIONER_USER_ID, firstName: 'amoCRM', lastName: 'Bridge' },
        role: 'Admin',
    })
    const exchange = await exchangeExternalToken({ externalAccessToken: jwtToken })
    if (!exchange.ok) {
        return { ok: false, reason: `exchange: ${exchange.reason}` }
    }
    const upsert = await upsertAmocrmConnection({
        token: exchange.token,
        projectId: exchange.projectId,
        subdomain,
        apiToken: amoToken,
    })
    if (!upsert.ok) {
        return { ok: false, reason: `upsert: ${upsert.reason}` }
    }
    return { ok: true }
}

const PROVISIONER_USER_ID = 'bridge-provisioner'

export type ProvisionParams = { accountId: string, subdomain: string, amoToken: string }
export type ProvisionResult = { ok: true } | { ok: false, reason: string }
