const cheerio = createCheerio()
const UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

const SITE = 'https://www.mtyy4.com'

const appConfig = {
    ver: 20260421,
    title: '麦田影院',
    site: SITE,
    tabs: [
        { name: '首页', ext: { type: '' } },
        { name: '电影', ext: { type: '1' } },
        { name: '电视剧', ext: { type: '2' } },
        { name: '综艺', ext: { type: '3' } },
        { name: '动漫', ext: { type: '4' } },
        { name: '短剧', ext: { type: '26' } },
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

function parseCards(html) {
    const $ = cheerio.load(html)
    const seen = new Set()
    const cards = []
    $('a[href*="/voddetail/"]').each((_, el) => {
        const $a = $(el)
        const href = $a.attr('href') || ''
        const m = href.match(/\/voddetail\/(\d+)\.html/)
        if (!m) return
        const id = m[1]
        if (seen.has(id)) return
        const img = $a.find('img').first()
        if (!img.length) return
        const title = ($a.attr('title') || img.attr('alt') || '').replace(/封面图$/, '').trim()
        if (!title) return
        seen.add(id)
        const pic = img.attr('data-src') || img.attr('src') || ''
        const remark = $a.find('.public-list-prb').first().text().trim()
        cards.push({
            vod_id: id,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: remark,
            ext: { id },
        })
    })
    return cards
}

async function getCards(ext) {
    ext = argsify(ext)
    const type = ext.type || ''
    const page = ext.page || 1
    let url
    if (type === '') {
        if (page > 1) return jsonify({ list: [] })
        url = `${SITE}/`
    } else {
        url = page > 1 ? `${SITE}/vodtype/${type}-${page}.html` : `${SITE}/vodtype/${type}.html`
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
        const { data } = await $fetch.get(`${SITE}/voddetail/${id}.html`, {
            headers: { 'User-Agent': UA },
        })
        const $ = cheerio.load(data)
        const srcNames = []
        $('.anthology-tab .swiper-slide').each((_, el) => {
            const $el = $(el)
            const name = $el.clone().children('.badge').remove().end().text().trim()
            if (name) srcNames.push(name)
        })
        $('.anthology-list-box').each((i, box) => {
            const tracks = []
            $(box)
                .find('a[href*="/vodplay/"]')
                .each((__, a) => {
                    const $a = $(a)
                    const name = $a.text().trim()
                    const href = $a.attr('href') || ''
                    if (!href) return
                    const url = href.startsWith('http') ? href : `${SITE}${href}`
                    tracks.push({ name, pan: '', ext: { url } })
                })
            if (tracks.length) groups.push({ title: srcNames[i] || `线路${i + 1}`, tracks })
        })
    } catch (e) {
        $print('getTracks err: ' + e)
    }
    return jsonify({ list: groups })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url
    if (!url) return jsonify({ urls: [] })
    try {
        const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } })
        const m = data.match(/player_\w+\s*=\s*(\{[\s\S]*?\})\s*<\/script>/)
        if (m) {
            const obj = JSON.parse(m[1])
            let playurl = obj.url || ''
            if (obj.encrypt == 1) playurl = decodeURIComponent(playurl)
            else if (obj.encrypt == 2) playurl = decodeURIComponent(atob(playurl))
            if (playurl) {
                return jsonify({
                    urls: [playurl],
                    headers: [{ 'User-Agent': UA, Referer: `${SITE}/` }],
                })
            }
        }
    } catch (e) {
        $print('getPlayinfo err: ' + e)
    }
    return jsonify({ urls: [] })
}

async function search(ext) {
    ext = argsify(ext)
    const kw = (ext.text || '').trim()
    if (!kw) return jsonify({ list: [] })
    try {
        const { data } = await $fetch.get(
            `${SITE}/index.php/ajax/suggest?mid=1&wd=${encodeURIComponent(kw)}`,
            { headers: { 'User-Agent': UA } },
        )
        const obj = typeof data === 'string' ? JSON.parse(data) : data
        const list = (obj.list || []).map((it) => ({
            vod_id: String(it.id),
            vod_name: it.name,
            vod_pic: it.pic || '',
            vod_remarks: '',
            ext: { id: String(it.id) },
        }))
        return jsonify({ list })
    } catch (e) {
        $print('search err: ' + e)
        return jsonify({ list: [] })
    }
}
