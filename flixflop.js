const cheerio = createCheerio()
const UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

const SITE = 'https://www.flixflop.com'
const API = `${SITE}/api/v1`

// 分类 ID 来自 /api/v1/categories（写死避免每次请求）
const appConfig = {
    ver: 20260421,
    title: '飞流视频',
    site: SITE,
    tabs: [
        { name: '电影', ext: { cat: '151438147786375168' } },
        { name: '电视剧', ext: { cat: '151438147794763777' } },
        { name: '动漫', ext: { cat: '151438147807346690' } },
        { name: '综艺', ext: { cat: '151438147807346691' } },
        { name: '体育', ext: { cat: '151438147807346693' } },
        { name: '电影解说', ext: { cat: '204814944317734918' } },
        { name: '短剧', ext: { cat: '331153971999670710' } },
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

function itemToCard(it) {
    return {
        vod_id: String(it.video_id),
        vod_name: it.title || '',
        vod_pic: it.cover_image || '',
        vod_remarks: [it.published_year, it.remarks].filter(Boolean).join(' · '),
        ext: { id: String(it.video_id) },
    }
}

async function getCards(ext) {
    ext = argsify(ext)
    const cat = ext.cat
    const page = ext.page || 1
    if (!cat) return jsonify({ list: [] })
    try {
        const { data } = await $fetch.get(`${API}/explore/${cat}?page=${page}`, {
            headers: { 'User-Agent': UA },
        })
        const obj = typeof data === 'string' ? JSON.parse(data) : data
        return jsonify({ list: (obj.data || []).map(itemToCard) })
    } catch (e) {
        $print('getCards err: ' + e)
        return jsonify({ list: [] })
    }
}

async function getTracks(ext) {
    ext = argsify(ext)
    const id = ext.id
    const groups = []
    try {
        const { data } = await $fetch.get(`${API}/videos/${id}/sources`, {
            headers: { 'User-Agent': UA },
        })
        const obj = typeof data === 'string' ? JSON.parse(data) : data
        for (const src of obj.data || []) {
            const raw = src.url || ''
            const tracks = raw
                .split('#')
                .map((seg) => {
                    const i = seg.indexOf('$')
                    if (i < 0) return null
                    const name = seg.slice(0, i).trim()
                    const url = seg.slice(i + 1).trim()
                    if (!url) return null
                    return { name: name || '正片', pan: '', ext: { url } }
                })
                .filter(Boolean)
            if (tracks.length) groups.push({ title: src.name || '默认', tracks })
        }
    } catch (e) {
        $print('getTracks err: ' + e)
    }
    return jsonify({ list: groups })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url
    if (!url) return jsonify({ urls: [] })
    return jsonify({
        urls: [url],
        headers: [{ 'User-Agent': UA, Referer: `${SITE}/` }],
    })
}

async function search(ext) {
    ext = argsify(ext)
    const kw = (ext.text || '').trim()
    if (!kw) return jsonify({ list: [] })
    try {
        const { data } = await $fetch.get(
            `${API}/explore/search?query=${encodeURIComponent(kw)}`,
            { headers: { 'User-Agent': UA } },
        )
        const obj = typeof data === 'string' ? JSON.parse(data) : data
        return jsonify({ list: (obj.data || []).map(itemToCard) })
    } catch (e) {
        $print('search err: ' + e)
        return jsonify({ list: [] })
    }
}
