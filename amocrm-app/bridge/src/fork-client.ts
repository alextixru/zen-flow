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

export type ForkCallResult = { ok: true } | { ok: false, reason: string }
