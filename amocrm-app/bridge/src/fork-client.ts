import { config } from './config.js'

// SERVICE-принципал форка: platform API key (sk-…), выпускается POST /v1/api-keys
// под platform-админом. Эндпоинт мержит origins без дублей — повторный вызов безопасен.
export async function addAllowedEmbedOrigin({ subdomain }: { subdomain: string }): Promise<ForkCallResult> {
    const origin = `https://${subdomain}.amocrm.ru`
    try {
        const response = await fetch(`${config.forkUrl}/api/v1/embed-subdomain/allowed-embed-origins`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${config.forkApiKey}`,
            },
            body: JSON.stringify({ allowedEmbedOrigins: [origin] }),
            signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) {
            return { ok: false, reason: `http ${response.status}` }
        }
        return { ok: true }
    }
    catch {
        return { ok: false, reason: 'network error' }
    }
}

// Обмен self-подписанного embed-JWT на project-сессию форка (managed-authn).
// Рабочий путь — /api/v1 (через туннель /v1 отдаёт SPA-HTML — грабля V001).
export async function exchangeExternalToken({ externalAccessToken }: { externalAccessToken: string }): Promise<ExchangeResult> {
    try {
        const response = await fetch(`${config.forkUrl}/api/v1/managed-authn/external-token`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ externalAccessToken }),
            signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) {
            return { ok: false, reason: `http ${response.status}` }
        }
        const body = await response.json() as { token?: unknown, projectId?: unknown }
        if (typeof body.token !== 'string' || typeof body.projectId !== 'string') {
            return { ok: false, reason: 'no project session' }
        }
        return { ok: true, token: body.token, projectId: body.projectId }
    }
    catch {
        return { ok: false, reason: 'network error' }
    }
}

// Апсерт amocrm-connection в проект клиента экшенным токеном (идемпотентно по externalId).
export async function upsertAmocrmConnection({ token, projectId, subdomain, apiToken }: UpsertConnectionParams): Promise<ForkCallResult> {
    try {
        const response = await fetch(`${config.forkUrl}/api/v1/app-connections`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                externalId: 'amocrm',
                displayName: 'amoCRM',
                pieceName: '@activepieces/piece-amocrm',
                projectId,
                type: 'CUSTOM_AUTH',
                value: {
                    type: 'CUSTOM_AUTH',
                    props: { subdomain, zone: 'amocrm.ru', apiToken },
                },
            }),
            signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) {
            return { ok: false, reason: `http ${response.status}` }
        }
        return { ok: true }
    }
    catch {
        return { ok: false, reason: 'network error' }
    }
}

// Тегирование pieces для JWT-фильтра piecesFilterType:'ALLOWED'+piecesTags (см. jwt.ts).
// SERVICE-принципал (platform API key) проходит platformAdminOnly на этом эндпоинте
// без юзерской сессии — POST полностью заменяет набор тегов piece'а, повторный вызов безопасен.
export async function setPieceTags({ pieceNames, tag }: SetPieceTagsParams): Promise<ForkCallResult> {
    try {
        const response = await fetch(`${config.forkUrl}/api/v1/tags/pieces`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${config.forkApiKey}`,
            },
            body: JSON.stringify({ piecesName: pieceNames, tags: [tag] }),
            signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) {
            return { ok: false, reason: `http ${response.status}` }
        }
        return { ok: true }
    }
    catch {
        return { ok: false, reason: 'network error' }
    }
}

export type ForkCallResult = { ok: true } | { ok: false, reason: string }
export type ExchangeResult = { ok: true, token: string, projectId: string } | { ok: false, reason: string }
export type UpsertConnectionParams = { token: string, projectId: string, subdomain: string, apiToken: string }
export type SetPieceTagsParams = { pieceNames: string[], tag: string }
