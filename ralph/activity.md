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

