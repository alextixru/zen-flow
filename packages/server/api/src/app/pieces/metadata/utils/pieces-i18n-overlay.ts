import { readFileSync } from 'fs'
import path from 'path'
import { isNil, LocalesEnum, tryCatchSync } from '@activepieces/core-utils'
import { I18nForPiece } from '@activepieces/pieces-framework'

// Реестровые метаданные pieces собраны апстримом без локали ru, хотя переводы
// в репозитории есть (packages/pieces/**/src/i18n/ru.json). Оверлей генерируется
// скриптом scripts/build-pieces-i18n-overlay.mjs; при отсутствии файла сервер
// работает как раньше — строки остаются английскими.
export const piecesI18nOverlay = {
    enrich<T extends PieceWithI18n>({ piece, locale }: EnrichParams<T>): T {
        if (locale !== LocalesEnum.RUSSIAN || !isNil(piece.i18n?.[LocalesEnum.RUSSIAN])) {
            return piece
        }
        const translations = loadOverlay()?.[piece.name]
        if (isNil(translations)) {
            return piece
        }
        return {
            ...piece,
            i18n: { ...piece.i18n, [LocalesEnum.RUSSIAN]: translations },
        }
    },
}

let cachedOverlay: OverlayMap | null | undefined

function loadOverlay(): OverlayMap | null {
    if (cachedOverlay === undefined) {
        const { data } = tryCatchSync<OverlayMap>(() => {
            const filePath = path.resolve('packages/server/api/src/assets/pieces-i18n/ru.json')
            return JSON.parse(readFileSync(filePath, 'utf8'))
        })
        cachedOverlay = data
    }
    return cachedOverlay
}

type OverlayMap = Record<string, Record<string, string>>

type PieceWithI18n = {
    name: string
    i18n?: I18nForPiece
}

type EnrichParams<T> = {
    piece: T
    locale: LocalesEnum
}
