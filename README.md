# 我的音声库（静态站源码）

线上：<https://xiwhash.github.io/asmr-online/m.html>

单文件页面 + 一个数据 JSON，没有构建依赖、没有框架。`index.html` / `m.html` / `player.html` 是同一份代码的三个入口（内容完全一样），改完源码用 `node build.js` 一次性生成。

## 目录

```
asmr-site-src/
├── src/
│   ├── index.template.html   骨架（head + body 结构，含 {{CSS}} {{BOOT}} {{DATA}} {{LISTS}} {{APP}} 占位）
│   ├── style.css             全部样式（14KB，含深色模式、列表、播放器、画中画）
│   ├── boot.js               启动兜底脚本：白屏时显示错误原因 + 重试/清缓存
│   ├── app.js                播放器与应用逻辑（64KB，纯 ES5，无依赖）
│   ├── data.json             作品 + 字幕（4.5MB）
│   └── lists.json            列表（我标记的 / xie / 用户自建）
├── covers/                   52 张封面（600px jpg，页面里用 covers/<RJ>.jpg 相对引用）
├── build.js                  组装脚本
├── check.js                  校验脚本（脚本块语法 + 数据可解析）
├── index.html                构建产物（与 m.html / player.html 相同）
├── m.html
└── player.html
```

## 构建

```bash
node build.js                 # src/* → index.html / m.html / player.html
node check.js index.html      # 校验：4 个 script 块语法 + 数据能 JSON.parse
```

`build.js` 里有个必须注意的点：`String.prototype.replace` 的**替换串**里 `$` 有特殊含义（`$&` `$1` `` $` `` 等），所以占位符替换一律用函数形式 `s.replace(key, () => val)`，否则代码里的正则 `$` 会吃掉内容。

## 数据格式

`src/data.json`：

```js
{
  "works": [
    {
      "rj": "RJ01152082",
      "title": "【简体中文版】…",
      "circle": "蒼悦",
      "vas": [], "tags": [], "rate": null, "rateN": 0,
      "cover": "covers/RJ01152082.jpg",
      "n": 6,                       // 轨数（页面显示的 "6 音轨"）
      "tracks": [
        {
          "i": 0,
          "f": "https://xiwhash.github.io/asmr-audio-9/RJ01152082/000.opus",
          "n": "Tr1 …",             // 显示名
          "d": 817,                 // 秒
          "p": ""                  // 可选：所在文件夹路径 "3/1"，用于文件夹视图
        }
      ],
      "rs": 0,                      // 可选：根目录轨时长和
      "ft": []                     // 可选：文件夹树 [{t:名字,p:路径,n:项目数,s:秒,c:[子节点]}]
    }
  ],
  "subs": {
    "RJ01152082/000": [ { "t": 3.38, "s": "这是何等的污秽啊…" } ]
  }
}
```

字幕 key 是 **`RJ/三位序号`**（序号是 `tracks` 数组下标，不是 `tracks[i].i`）。
加了/删了轨，key 必须跟着重排，否则字幕会错位到别的轨上。

`src/lists.json`：

```js
[
  { "id": "marked", "name": "我标记的", "by": "谢hhhh", "works": ["RJ…", "RJ…"] },
  { "id": "xie",    "name": "xie",     "by": "谢hhhh", "works": ["RJ…"] }
]
```

判定同一列表：**id 相同或名字相同**（trim + 小写）。
合并规则：顺序以服务器下发的为准，本机额外加进去的排后面，被删掉的不会回来（`removed` 数组粘性）。

## 部署

页面仓库是 `xiwhash/asmr-online`，GitHub Pages 从 `main` 出。

```bash
# 方式一：GitHub contents API（我用的小工具）
node deploy-m.js m.html        # 推到 asmr-online/m.html，NO_DP=1 时只推不触发构建
# 三个文件都推完，再手动触发一次 pages.yml 的 workflow_dispatch
```

只触发**一次**构建：连发多个 dispatch 会被 concurrency 取消，只保留最后一个。

## 音频放哪

- 音频不进页面仓库，而是分散在 `xiwhash/asmr-audio-1` … `asmr-audio-11`，每个仓库约 850MB 一换。
- **一律用 GitHub Pages 直链**：`https://xiwhash.github.io/<repo>/<RJ>/<NNN>.opus`
  - 支持 Range（206）、`Access-Control-Allow-Origin: *`（预取 blob 需要 CORS）
  - 不要换回 jsDelivr：仓库体积大了会返回 `403 Package size exceeded the configured limit of 50 MB`，新文件还会 404
- 每个音频仓库都要单独开 Pages：`POST /repos/{owner}/{repo}/pages` `{"source":{"branch":"main","path":"/"}}`

## app.js 里值得知道的几处

| 函数 | 作用 |
|---|---|
| `renderHome / renderWork / renderLists / renderListWorks` | 四个视图，全部手写 innerHTML |
| `__autoPath(w)` | 进作品时自动钻到「SEあり / 本編 / mp3」那层文件夹，避免先看到一列文件夹 |
| `__autoPath` 评分 | 时长 ×1.4（命中 SEあり/本編）×1.05（mp3/音声），排除 `SEなし/サンプル/過去作/特典/台本` |
| `playTrack` | 换轨：`cur` 重建、`buildLyric()` 重置、标题/封面同步、预热下一轨 |
| `__pfKick / __pfUrl` | 起播加速：`fetch` 音频成 Blob 缓存 2 条，`au.src` 优先用 blob URL；>24MB 不缓存；省流量模式不预取 |
| `centerLine(el, smooth)` | 字幕居中：用 `getBoundingClientRect` 差值算内容坐标（**不要**用 `offsetTop`，`.lrow` 的 offsetParent 是 `#full`，会偏一行的高度） |
| `syncLyric(force)` | `force` 时立刻对齐；`__lyricLock` 在点字幕/滑动后 900ms 内阻止自动滚动抢位置 |
| 滑动快进 | `pointerdown/move/up`，横移 >12px 且大于竖移 1.3 倍才算快进；每秒 ≈ `dur/700` 秒；松手才 seek |
| `__swapHost` | 播放报错时 Pages ⇄ jsDelivr 换源重试一次 |
| `__bootShow` | 白屏兜底：`#view` 为空时把错误贴出来，带「重新加载 / 清缓存后重载」 |
| `PiP` / `FloatSub` | 系统画中画（canvas → captureStream → video → requestPictureInPicture）与页内悬浮字幕 |
| `window.__nav` | 调试入口：`__nav.home() / work(rj) / play(rj,i) / full() / lists() / list(id) / L()` |

## 已知的坑（都踩过）

1. 发布新作品时**不要用 `works.unshift()` 逐条插**——插 N 次顺序就反 N 次，列表顺序看着就乱了。要按目标顺序重建数组。
2. 下载字幕时别用固定大小阈值（我原来写 `size > 4096`），1~4KB 的小 `.vtt` 会被当失败丢掉，表现是「某几轨没字幕」。
3. 有的作品是 `01b-【MP3】/03-【含 SE】` 和 `04-【无 SE】` 双目录、轨道同名。选目录要按**完整路径**分组，否则同名轨道互相覆盖、轨数直接砍半。
4. `#full` 是 `position:fixed`，所以 `.lrow` 的 `offsetParent` 是它而不是滚动容器——任何基于 `offsetTop` 的居中都会偏。
5. 不要用 PowerShell 的 `Set-Content -Encoding UTF8` 改这些 JS：会把中文二次编码，正则和转义全废。
