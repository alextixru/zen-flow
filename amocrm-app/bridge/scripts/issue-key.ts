// CLI: выпуск install-ключа. Пишет pending-строку в БД и печатает ключ в stdout
// (единственный вывод — сам ключ; ничего больше не логируется). Запуск: npm run issue-key
import { randomBytes } from 'node:crypto'
import { db } from '../src/db.js'

const installKey = randomBytes(32).toString('base64url')
db.prepare(
    'INSERT INTO accounts (install_key, account_id, subdomain, amo_token, status, created_at) VALUES (?, ?, ?, NULL, ?, ?)',
).run(installKey, '', '', 'pending', new Date().toISOString())
process.stdout.write(`${installKey}\n`)
