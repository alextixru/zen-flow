import { resolve } from 'node:path'

const BRIDGE_ROOT = resolve(import.meta.dirname, '..')

function requireEnv({ name }: { name: string }): string {
    const value = process.env[name]
    if (value === undefined || value === '') {
        throw new Error(`Missing required env var: ${name} (см. env.example)`)
    }
    return value
}

export const config = {
    port: Number(requireEnv({ name: 'PORT' })),
    forkUrl: requireEnv({ name: 'FORK_URL' }),
    bridgePublicUrl: requireEnv({ name: 'BRIDGE_PUBLIC_URL' }),
    signingKeyPath: resolve(BRIDGE_ROOT, requireEnv({ name: 'SIGNING_KEY_PATH' })),
    signingKeyId: requireEnv({ name: 'SIGNING_KEY_ID' }),
    dbPath: resolve(BRIDGE_ROOT, requireEnv({ name: 'DB_PATH' })),
    forkApiKey: requireEnv({ name: 'FORK_API_KEY' }),
    dpSecret: requireEnv({ name: 'DP_SECRET' }),
}
