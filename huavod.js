const cheerio = createCheerio()
const UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'

const SITE = 'https://huavod.com'
const PLAYER_HOST = 'https://newplayer.huavod.com'

// 简易等待（没有全局 setTimeout 时退化成 Promise 轮询）
function sleep(ms) {
    return new Promise((resolve) => {
        if (typeof setTimeout === 'function') setTimeout(resolve, ms)
        else {
            const end = Date.now() + ms
            ;(function loop() {
                if (Date.now() >= end) resolve()
                else Promise.resolve().then(loop)
            })()
        }
    })
}

function parseCookie(headers) {
    // 兼容大小写
    if (!headers) return ''
    const keys = Object.keys(headers)
    for (const k of keys) {
        if (/^set-cookie$/i.test(k)) {
            const v = headers[k]
            const raw = Array.isArray(v) ? v.join(',') : v
            return (raw || '').split(';')[0] || ''
        }
    }
    return ''
}

const appConfig = {
    ver: 20260421,
    title: '华视影院',
    site: SITE,
    tabs: [
        { name: '电影', ext: { type: '1' } },
        { name: '电视剧', ext: { type: '2' } },
        { name: '综艺', ext: { type: '3' } },
        { name: '动漫', ext: { type: '4' } },
        { name: '短剧', ext: { type: '5' } },
        { name: '纪录片', ext: { type: '42' } },
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

function parseCards(html) {
    const $ = cheerio.load(html)
    const seen = new Set()
    const cards = []
    $('a.public-list-exp[href*="/voddetail/"], a[href*="/voddetail/"]').each((_, el) => {
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
        const remark =
            $a.find('.public-list-prb').first().text().trim() ||
            $a.find('.public-prt').first().text().trim()
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
    const type = ext.type
    const page = ext.page || 1
    if (!type) return jsonify({ list: [] })
    const url = page > 1
        ? `${SITE}/vodshow/${type}/page/${page}.html`
        : `${SITE}/vodshow/${type}.html`
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
            const name = $(el).clone().children('.badge').remove().end().text().trim()
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
    const playbackHeaders = [{ 'User-Agent': UA, Referer: `${SITE}/` }]
    try {
        // 1) vodplay 页里拿 player_xxx.url（已加密）
        const { data: playHtml } = await $fetch.get(url, {
            headers: { 'User-Agent': UA, Referer: `${SITE}/` },
        })
        const pm = playHtml.match(/player_\w+\s*=\s*(\{[\s\S]*?\})\s*<\/script>/)
        if (!pm) return jsonify({ urls: [url], headers: playbackHeaders })
        const pj = JSON.parse(pm[1])
        const enc = pj.url || ''
        if (!enc) return jsonify({ urls: [], headers: playbackHeaders })
        if (pj.encrypt == 1) {
            return jsonify({ urls: [decodeURIComponent(enc)], headers: playbackHeaders })
        }
        if (pj.encrypt == 2) {
            return jsonify({ urls: [decodeURIComponent(atob(enc))], headers: playbackHeaders })
        }
        // encrypt == 3 走站外 newplayer.huavod.com：
        //   GET  ec.php → 拿 token + session cookie
        //   POST resolve/url → 轮询 "too_early" 直到拿到真实 m3u8（通常 13-15s）
        const ecUrl = `${PLAYER_HOST}/player/ec.php?code=ok&url=${encodeURIComponent(
            enc,
        )}&main_domain=${encodeURIComponent(`${SITE}/`)}`
        const ecRes = await $fetch.get(ecUrl, {
            headers: { 'User-Agent': UA, Referer: `${SITE}/` },
        })
        const cookie = parseCookie(ecRes.headers) || ''
        const ecHtml = ecRes.data
        const tm = ecHtml.match(/"token"\s*:\s*"([^"]+)"/)
        if (!tm) return jsonify({ urls: [], headers: playbackHeaders })
        const token = tm[1]
        const resolveHeaders = {
            'User-Agent': UA,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: '*/*',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            Origin: PLAYER_HOST,
            Referer: ecUrl,
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Dest': 'empty',
        }
        if (cookie) resolveHeaders.Cookie = cookie
        const startMs = Date.now()
        for (let i = 0; i < 12; i++) {
            if (Date.now() - startMs > 30000) break
            const { data } = await $fetch.post(
                `${PLAYER_HOST}/index.php/api/resolve/url`,
                `token=${encodeURIComponent(token)}`,
                { headers: resolveHeaders },
            )
            let j
            try {
                j = typeof data === 'string' ? JSON.parse(data) : data
            } catch (_) {
                break
            }
            if (j && j.code === 1 && j.data && j.data.url) {
                return jsonify({ urls: [j.data.url], headers: playbackHeaders })
            }
            const waitMs = j && j.data && j.data.retry_after_ms
            await sleep(waitMs ? Math.min(Math.max(waitMs, 500), 4000) : 2000)
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
            vod_pic: it.pic || it.vod_pic || '',
            vod_remarks: '',
            ext: { id: String(it.id) },
        }))
        return jsonify({ list })
    } catch (e) {
        $print('search err: ' + e)
        return jsonify({ list: [] })
    }
}
