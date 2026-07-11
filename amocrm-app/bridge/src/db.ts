import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { config } from './config.js'

mkdirSync(dirname(config.dbPath), { recursive: true })

export const db = new Database(config.dbPath)
db.pragma('journal_mode = WAL')

db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
        install_key TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        subdomain TEXT NOT NULL,
        amo_token TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'revoked')),
        created_at TEXT NOT NULL
    )
`)
