import { readFileSync } from 'node:fs'
import jwt from 'jsonwebtoken'
import { config } from './config.js'

export function signEmbedJwt({ accountId, subdomain, user, piecesTags, role }: SignEmbedJwtParams): string {
    const privateKey = readFileSync(config.signingKeyPath, 'utf8')
    const payload = {
        version: 'v3',
        externalUserId: user.id,
        externalProjectId: accountId,
        firstName: user.firstName,
        lastName: user.lastName,
        projectDisplayName: subdomain,
        ...(role ? { role } : {}),
        ...(piecesTags ? { piecesFilterType: 'ALLOWED' as const, piecesTags } : {}),
    }
    return jwt.sign(payload, privateKey, {
        algorithm: 'RS256',
        keyid: config.signingKeyId,
        expiresIn: '1h',
    })
}

export type EmbedUser = {
    id: string
    firstName: string
    lastName: string
}

// Несуществующая роль роняет обмен на стороне форка — тип фиксирует допустимые значения.
export type EmbedRole = 'Admin' | 'Editor' | 'Viewer'

export type SignEmbedJwtParams = {
    accountId: string
    subdomain: string
    user: EmbedUser
    piecesTags?: string[]
    role?: EmbedRole
}
