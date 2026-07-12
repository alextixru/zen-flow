import querystring from 'node:querystring'

// amo шлёт DP-хуки (и, вероятно, salesbot widget_request) как
// application/x-www-form-urlencoded с PHP-скобочной нотацией вложенности:
// event[data][leads][status][0][id]=123&action[settings][widget][settings][flow_id]=abc
// Снято живьём 2026-07-12: Fastify без парсера отвечал 415 на реальный DP-хук.
// Раскрываем скобки в объект стандартной библиотекой, без новой зависимости.
// ponytail: контейнеры всегда plain-объекты (числовые индексы — строковые ключи
// "0","1"), массивы не восстанавливаем — потребителям (digObject/поиск id) хватает.
export function parseFormBody({ raw }: { raw: string }): Record<string, unknown> {
    const flat = querystring.parse(raw)
    const root: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(flat)) {
        const path = bracketKeyToPath({ key })
        if (path === null) {
            continue
        }
        const values = Array.isArray(value) ? value : [value]
        for (const item of values) {
            setAtPath({ root, path, value: item ?? '' })
        }
    }
    return root
}

function bracketKeyToPath({ key }: { key: string }): string[] | null {
    const match = key.match(/^([^[\]]+)((?:\[[^[\]]*\])*)$/)
    if (match === null || match[1] === undefined) {
        return null
    }
    const segments = [match[1]]
    for (const bracket of (match[2] ?? '').match(/\[[^[\]]*\]/g) ?? []) {
        segments.push(bracket.slice(1, -1))
    }
    return segments
}

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function setAtPath({ root, path, value }: { root: Record<string, unknown>, path: string[], value: string }): void {
    // Ключи приходят от amo (внешний вход) — блокируем prototype pollution.
    if (path.some((segment) => DANGEROUS_KEYS.has(segment))) {
        return
    }
    let node = root
    for (const rawSegment of path.slice(0, -1)) {
        // Пустой сегмент (a[]=x) — PHP-стиль "append": заменяем на текущий размер узла.
        const segment = rawSegment === '' ? String(Object.keys(node).length) : rawSegment
        const existing = node[segment]
        if (typeof existing === 'object' && existing !== null) {
            node = existing as Record<string, unknown>
        } else {
            const child: Record<string, unknown> = {}
            node[segment] = child
            node = child
        }
    }
    const rawLast = path[path.length - 1] ?? ''
    const last = rawLast === '' ? String(Object.keys(node).length) : rawLast
    node[last] = value
}
