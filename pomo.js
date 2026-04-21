const cheerio = createCheerio()
const UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

const SITE = 'https://pomo.mom'

const appConfig = {
    ver: 20260421,
    title: 'Pomo 4K',
    site: SITE,
    tabs: [
        { name: '最新', ext: { path: '' } },
        { name: '华语热门', ext: { path: 'huayurm' } },
        { name: '家庭影院', ext: { path: 'jiating' } },
        { name: '动画大电影', ext: { path: 'donghuadadiany' } },
        { name: '冷门佳片', ext: { path: 'lengmenjiapian' } },
        { name: 'TOP250', ext: { path: 'paihangbang' } },
        { name: '剧集', ext: { path: 'dianshiju' } },
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

function parseCards(html) {
    const $ = cheerio.load(html)
    const seen = new Set()
    const cards = []
    $('a[href*="pomo.mom/"]').each((_, el) => {
        const $a = $(el)
        const href = $a.attr('href') || ''
        const m = href.match(/pomo\.mom\/(\d+)$/)
        if (!m) return
        const img = $a.find('img').first()
        if (!img.length) return
        const id = m[1]
        if (seen.has(id)) return
        const title = (img.attr('alt') || $a.find('h3').first().text() || '').trim()
        if (!title) return
        seen.add(id)
        const pic = img.attr('src') || img.attr('data-src') || ''
        const sub =
            $a.find('h3').nextAll('div').first().text().trim() ||
            $a.find('.text-gray-300, .text-gray-400').first().text().trim()
        cards.push({
            vod_id: id,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: sub || '',
            ext: { id },
        })
    })
    return cards
}

async function getCards(ext) {
    ext = argsify(ext)
    const path = ext.path || ''
    const page = ext.page || 1
    let url
    if (path === '') {
        url = page > 1 ? `${SITE}/page/${page}` : `${SITE}/`
    } else {
        url = page > 1 ? `${SITE}/${path}/page/${page}` : `${SITE}/${path}`
    }
    try {
        const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } })
        return jsonify({ list: parseCards(data) })
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
        const playPage = `${SITE}/?plugin=plyr_player&gid=${id}`
        const { data } = await $fetch.get(playPage, {
            headers: { 'User-Agent': UA, Referer: `${SITE}/${id}` },
        })
        const m = data.match(/rawData\s*=\s*(\[[\s\S]*?\])\s*;/)
        if (m) {
            const arr = JSON.parse(m[1])
            const tracks = arr
                .map((s, i) => {
                    const idx = s.indexOf('$')
                    const name = idx >= 0 ? s.slice(0, idx) : `第${i + 1}集`
                    const src = idx >= 0 ? s.slice(idx + 1) : s
                    return { name: name || `第${i + 1}集`, pan: '', ext: { m3u8: src } }
                })
                .filter((t) => t.ext.m3u8)
            if (tracks.length) groups.push({ title: '在线播放', tracks })
        }
    } catch (e) {
        $print('plyr err: ' + e)
    }

    try {
        const { data } = await $fetch.get(`${SITE}/${id}`, {
            headers: { 'User-Agent': UA },
        })
        const $ = cheerio.load(data)
        $('.x-dbjs-accordion-item').each((_, item) => {
            const $item = $(item)
            const cat = $item.find('.x-dbjs-accordion-title').first().text().trim() || '磁力'
            const tracks = []
            $item.find('.download-item').each((__, di) => {
                const $di = $(di)
                const url = $di.find('.x-dbjs-download-link').attr('data-url') || ''
                if (!url.startsWith('magnet:')) return
                const name = $di.find('.x-dbjs-download-link').text().trim()
                const size = $di.find('.file-size').text().trim()
                tracks.push({
                    name: size ? `${name} ${size}` : name,
                    pan: url,
                    ext: {},
                })
            })
            if (tracks.length) groups.push({ title: `磁力·${cat}`, tracks })
        })
    } catch (e) {
        $print('magnet err: ' + e)
    }

    return jsonify({ list: groups })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const m3u8 = ext.m3u8
    if (!m3u8) return jsonify({ urls: [] })

    const headers = [{ 'User-Agent': UA, Referer: `${SITE}/` }]
    try {
        const api = `${SITE}/content/plugins/plyr_player/api.php?type=parse&url=${encodeURIComponent(m3u8)}`
        const { data } = await $fetch.get(api, {
            headers: { 'User-Agent': UA, Referer: `${SITE}/` },
        })
        const obj = typeof data === 'string' ? JSON.parse(data) : data
        if (obj && obj.code === 200 && obj.data) {
            return jsonify({ urls: [obj.data], headers })
        }
    } catch (e) {
        $print('parse err: ' + e)
    }
    return jsonify({ urls: [m3u8], headers })
}

async function search(ext) {
    ext = argsify(ext)
    const kw = (ext.text || '').trim()
    if (!kw) return jsonify({ list: [] })
    const url = `${SITE}/?keyword=${encodeURIComponent(kw)}`
    try {
        const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } })
        return jsonify({ list: parseCards(data) })
    } catch (e) {
        $print('search err: ' + e)
        return jsonify({ list: [] })
    }
}
