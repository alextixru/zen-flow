# Activity log — piece amoCRM (Ralph-цикл)

Хронологический лог итераций. Одна запись на итерацию/задачу. Новые записи — сверху вниз в порядке выполнения.

## Формат записи

```
### <дата ISO> — <ID задачи>: <название>
- Статус: done | blocked | partial
- Изменения: какие файлы созданы/изменены (кратко)
- Команды: что запускалось (сборка/тесты/lint)
- Верификация: результат verify (pass/fail + вывод по существу)
- Блокеры: что помешало / открытые вопросы / что вынесено дальше
```

## Лог

### 2026-07-10 — T001: Scaffold piece + auth + validate
- Статус: done
- Изменения: `packages/pieces/community/amocrm/` — `package.json`, `tsconfig.json`, `tsconfig.lib.json`, `.eslintrc.json`, `README.md`, `src/index.ts` (createPiece + createCustomApiCallAction, ponytail-коммент про логотип-заглушку), `src/lib/auth.ts` (CustomAuth: subdomain/zone/apiToken + validate через GET /account), `src/i18n/translation.json`. Плюс path `@activepieces/piece-amocrm` в `tsconfig.base.json` и механический `bun.lock`. Каркас был частично создан оборвавшейся прошлой итерацией (без коммита и записи) — эта итерация доверила, доверификовала и закоммитила. `project.json` не создавался: у kommo его нет, репо на turbo.
- Команды: `npx turbo run lint --filter=@activepieces/piece-amocrm` — pass (5/5 tasks); `npx turbo run build --filter=@activepieces/piece-amocrm` — pass (5/5); `npm run lint-dev` — 0 errors (72 предсуществующих warning в web, вне скоупа); smoke на dev-стенде: `GET /api/v4/account` c валидным токеном → 200, с невалидным → 401 (validate отработает верно).
- Верификация: pass. code-review (low) по диффу — находок нет.
- Блокеры: нет. Замечания: (1) `ralph/ralph.sh` изменён в рабочем дереве (добавлен `--model fable`) — вне разрешённых путей итерации, оставлен незакоммиченным (позже закоммичен параллельно человеком/оркестратором как c34c7e0e); (2) `tryCatch` реэкспортируется из `@activepieces/pieces-framework` — в piece импортируем оттуда, не из `@activepieces/shared` (import boundary); (3) **commitlint запрещает заглавные в subject** — `feat(amocrm): T001 ...` отклоняется, использовать строчное `t001`.

### 2026-07-10 — T002: common/client.ts — makeRequest + пагинация
- Статус: done
- Изменения: `src/lib/common/client.ts` (`amoClient = { makeRequest, fetchAllPages }`: named params, URL из subdomain/zone, Bearer, tryCatch, читаемые ошибки из тела amo; пагинация page++ с остановкой по отсутствию `_links.next`/пустому `_embedded`, жёсткий предел 100 страниц), `src/lib/common/index.ts` (реэкспорт), колокейт `client.test.ts` (4 теста: URL/заголовки, проброс ошибки amo, склейка 2 страниц + остановка, пустой 204-ответ).
- Решение: спека требует `ActivepiecesError`, но он живёт в `@activepieces/shared`, запрещённом для pieces (import boundary), и НЕ реэкспортируется из `pieces-framework` — бросаю обычный `Error` с `amoCRM API error (<status>): <body>` (HttpError из pieces-common даёт status/body). В тесте есть `as HttpRequest` на mock.calls — это принятый паттерн репо (coupa client.test.ts), тип теряется в vi.spyOn.
- Команды: `npx turbo run lint --filter=@activepieces/piece-amocrm` — pass (5/5); `npx vitest run .../client.test.ts` — 4/4 passed; `npx turbo run build --filter=@activepieces/piece-amocrm` — pass; `npm run lint-dev` — 0 errors (те же 72 предсуществующих warning в web). Корневой `npm run test-unit` piece-тесты не подхватывает (script фильтрует engine/shared/web) — по спеке достаточно локального vitest.
- Верификация: pass. code-review (low) — находок нет. Smoke на dev-стенде: `GET /api/v4/leads?page=1&limit=1` → ключи `_embedded.leads`, `_links.next` — форма совпадает с реализацией fetchAllPages.
- Блокеры: нет.

