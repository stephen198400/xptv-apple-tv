# xptv-pomo

XPTV（Apple TV 在线播放器）自定义源：接入 [pomo.mom](https://pomo.mom/)（4K 原盘下载站）。

## 功能

- 首页 / 华语热门 / 家庭影院 / 动画大电影 / 冷门佳片 / TOP250 / 剧集 等分类
- 关键字搜索（`/?keyword=xxx`）
- 详情页同时给出：
  - **在线播放**：走站内 `plyr_player` 插件，通过 `api.php?type=parse` 拿到有时效性的 m3u8 代理地址
  - **磁力下载**：按「原盘 / 4K / 中字4K」分组的 magnet，放在 `pan` 字段

## 本地调试

```bash
npm i
node test.mjs
```

`test.mjs` 用 `new Function()` 把 `pomo.js` 注入一个 stub 的 xptv 运行时（`createCheerio`、`$fetch`、`argsify`、`jsonify`、`$print`），然后跑 `getConfig / getCards / search / getTracks / getPlayinfo`。

## 发布给 xptv 使用

把 `pomo.js` 托管到任意 raw URL（GitHub raw、自建静态）。  
在 `pomo.json` 的 `ext` 字段填入该 raw URL，把 `pomo.json` 也托管出去。  
在 xptv 客户端里「添加订阅」→ 填 `pomo.json` 的 URL。

## 关键发现

- 在线播放入口：详情页顶部一个按钮 `a.play-btn[href="/?plugin=plyr_player&gid=<id>"]`  
- 播放页 JS 里有 `rawData = ["<名字>$<m3u8>", ...]`
- 直连 m3u8 → 403（防盗链）；必须走 `api.php?type=parse&url=<encoded>` 获得一次性代理 URL（有效期较短，xptv 每次播放都重新请求即可）
- 返回代理 URL 时带 `Referer: https://pomo.mom/` 的 headers 更稳
