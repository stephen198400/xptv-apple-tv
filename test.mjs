import fs from 'node:fs'
import * as cheerio from 'cheerio'

globalThis.createCheerio = () => cheerio
globalThis.createCryptoJS = () => ({})
globalThis.$print = (...a) => console.log('[print]', ...a)
globalThis.argsify = (x) => (typeof x === 'string' ? JSON.parse(x) : x)
globalThis.jsonify = (x) => JSON.stringify(x)

globalThis.$fetch = {
    async get(url, opts = {}) {
        console.log('[GET]', url)
        const res = await fetch(url, { headers: opts.headers || {} })
        const text = await res.text()
        return { data: text, code: res.status }
    },
}

const src = fs.readFileSync('./pomo.js', 'utf8')
const modFactory = new Function(
    'createCheerio',
    'createCryptoJS',
    '$print',
    'argsify',
    'jsonify',
    '$fetch',
    src + '\nreturn { getConfig, getCards, getTracks, getPlayinfo, search };',
)
const mod = modFactory(
    globalThis.createCheerio,
    globalThis.createCryptoJS,
    globalThis.$print,
    globalThis.argsify,
    globalThis.jsonify,
    globalThis.$fetch,
)

const run = async (label, fn) => {
    console.log('\n=== ' + label + ' ===')
    try {
        const out = await fn()
        const parsed = JSON.parse(out)
        const compact = Array.isArray(parsed.list) ? { count: parsed.list.length, first: parsed.list[0], last: parsed.list[parsed.list.length - 1] } : parsed
        console.log(JSON.stringify(compact, null, 2).slice(0, 2000))
    } catch (e) {
        console.error('FAIL:', e.message)
    }
}

await run('getConfig', () => mod.getConfig())
await run('getCards home', () => mod.getCards(JSON.stringify({ path: '', page: 1 })))
await run('getCards jiating p2', () => mod.getCards(JSON.stringify({ path: 'jiating', page: 2 })))
await run('search 阿凡达', () => mod.search(JSON.stringify({ text: '阿凡达' })))
await run('getTracks 1883 (Mandalorian)', () => mod.getTracks(JSON.stringify({ id: '1883' })))
await run('getTracks 1284 (Hail Mary)', () => mod.getTracks(JSON.stringify({ id: '1284' })))
