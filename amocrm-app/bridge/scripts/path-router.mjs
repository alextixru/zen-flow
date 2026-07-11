// Однопортовый path-роутер dev-стенда: SSH-туннель на amoai-dev.dzen.team
// форвардит ровно один локальный порт, а https нужен и форку, и мосту.
// /bridge/* -> мост (BRIDGE_PORT), всё остальное -> форк (FORK_PORT).
// WebSocket upgrade (socket.io билдера) проксируется на тот же таргет.
import http from 'node:http'
import net from 'node:net'

const PORT = Number(process.env.ROUTER_PORT ?? 8090)
const FORK_PORT = Number(process.env.FORK_PORT ?? 8080)
const BRIDGE_PORT = Number(process.env.BRIDGE_PORT ?? 8083)

function targetPort({ url }) {
    return url === '/bridge' || url.startsWith('/bridge/') ? BRIDGE_PORT : FORK_PORT
}

const server = http.createServer((req, res) => {
    // Маркер для dev-stand.sh: отличает туннель через роутер от осиротевшего
    // ssh, форвардящего прямо на форк (тот отвечает SPA-страницей на любой путь).
    if (req.url === '/__router-health') {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end('router-ok')
        return
    }
    const proxy = http.request({
        host: '127.0.0.1',
        port: targetPort({ url: req.url ?? '/' }),
        path: req.url,
        method: req.method,
        headers: req.headers,
    }, (upstream) => {
        res.writeHead(upstream.statusCode ?? 502, upstream.headers)
        upstream.pipe(res)
    })
    proxy.on('error', () => {
        if (!res.headersSent) {
            res.writeHead(502, { 'content-type': 'text/plain' })
        }
        res.end('upstream down')
    })
    req.pipe(proxy)
})

server.on('upgrade', (req, socket, head) => {
    const upstream = net.connect(targetPort({ url: req.url ?? '/' }), '127.0.0.1', () => {
        let raw = `${req.method} ${req.url} HTTP/1.1\r\n`
        for (let i = 0; i < req.rawHeaders.length; i += 2) {
            raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`
        }
        upstream.write(`${raw}\r\n`)
        if (head.length > 0) {
            upstream.write(head)
        }
        socket.pipe(upstream)
        upstream.pipe(socket)
    })
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
})

server.listen(PORT, '127.0.0.1', () => {
    process.stdout.write(`path-router: :${PORT} -> fork :${FORK_PORT}, /bridge/* -> :${BRIDGE_PORT}\n`)
})
