// CLI: привязать long-lived amo-токен к связке. Токен НЕ из argv (виден в ps) —
// из env AMO_TOKEN или stdin. Токен не печатается и не логируется.
// Запуск: AMO_TOKEN=… npm run set-amo-token -- --key <install_key>
//     или: echo <token> | npm run set-amo-token -- --key <install_key>
import { db } from '../src/db.js'

function argValue(flag: string): string | undefined {
    const index = process.argv.indexOf(flag)
    return index !== -1 ? process.argv[index + 1] : undefined
}

async function readStdin(): Promise<string> {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer)
    }
    return Buffer.concat(chunks).toString('utf8')
}

const installKey = argValue('--key')
if (installKey === undefined || installKey === '') {
    process.stderr.write('Usage: set-amo-token --key <install_key> (token via AMO_TOKEN env or stdin)\n')
    process.exit(1)
}

const token = (process.env.AMO_TOKEN ?? await readStdin()).trim()
if (token === '') {
    process.stderr.write('Empty token: set AMO_TOKEN env or pipe the token via stdin\n')
    process.exit(1)
}

const result = db.prepare('UPDATE accounts SET amo_token = ? WHERE install_key = ?').run(token, installKey)
if (result.changes === 0) {
    process.stderr.write('No account found for the given install_key\n')
    process.exit(1)
}
process.stderr.write('amo_token set\n')
