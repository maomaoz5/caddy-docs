# Caddy 中文文档站

基于 [Astro](https://astro.build) + [Starlight](https://starlight.astro.build) 搭建的 Caddy 文档站，
中文界面，21 个页面，自定义主题与 Caddyfile 语法高亮。

## 快速开始

```bash
npm install
npm run dev        # 开发服务器，默认 http://localhost:4321
npm run build      # 构建静态站点到dist/
npm run preview    # 预览构建产物
```

## 项目结构

```
src/
├── assets/                    # logo、favicon 源文件
├── components/
│   └── Footer.astro           # 自定义页脚（自动读取侧边栏结构生成导航）
├── content/
│   ├── docs/                  # 文档正文（Markdown）
│   │   ├── index.md           #   首页（splash 模板 + hero）
│   │   ├── getting-started/   #   安装、第一个 Caddyfile
│   │   ├── concepts/          #   配置结构、指令、匹配器、处理指令、变量
│   │   ├── guides/            #   HTTPS、反代、静态站点、负载均衡、WebSocket
│   │   ├── advanced/          #   JSON 配置、日志、性能、常见坑
│   │   └── reference/         #   CLI、全局选项、Go 集成
│   └── i18n/
│       └── zh-CN.json         # 中文界面文案
├── shiki/
│   └── caddyfile.tmLanguage.json   # 自定义 Caddyfile 语法高亮
├── styles/
│   └── theme.css              # 主题：品牌色、导航、卡片、代码块样式
└── content.config.ts          # docs + i18n 两个 collection

astro.config.mjs               # 站点配置、侧边栏、Caddyfile 高亮注册
public/favicon.svg
```

## 主题定制

品牌色是蓝绿渐变，定义在 `src/styles/theme.css`：

```css
--caddy-blue: #4a8cff;
--caddy-green: #22d3a7;
--caddy-gradient: linear-gradient(135deg, #4a8cff 0%, #22d3a7 100%);
```

改了主色只需要动这两个变量，页头背景、标题渐变、卡片 hover 都会跟着变。

深色模式单独覆盖了 Starlight 的 `--sl-color-gray-*` 系列，用带蓝调的深灰替代默认的中性灰。

## Caddyfile 语法高亮

Shiki 自带语言包里没有 Caddyfile，所以手写了一份 TextMate grammar：

`src/shiki/caddyfile.tmLanguage.json` 支持：
- 注释 `#`
- 站点块 `{ }` 与片段 `(name)`
- 指令 `reverse_proxy`、`file_server` 等
- 具名匹配器 `@api`
- 占位符 `{http.request.uri}` 与环境变量 `{$DOMAIN}`
- 字符串（双引号与反引号）、端口

**在 `astro.config.mjs` 中通过 `markdown.shikiConfig.langs` 注册**：

```js
markdown: {
  shikiConfig: {
    langs: [caddyfileGrammar],
    langAlias: { caddy: 'caddyfile' },
  },
},
```

注意：Starlight 0.42 移除了 `expressiveCode.shiki` 选项（也移除了 `lastUpdatedText`），
写在 `starlight()` 里不生效；`ec.config.mjs` 虽然会被加载，但 `langs` 传不到 Astro 的 Shiki 实例。
正确位置是顶层 `markdown.shikiConfig`。

Markdown 里用 ```` ```caddy ```` 即可。

## 添加新页面

1. 在 `src/content/docs/` 下创建 `.md`，frontmatter 需要 `title` 和 `description`
2. 在 `astro.config.mjs` 的 `sidebar` 里加一条`{ label, slug }`

`sidebar` 中的 `slug` 对应文件路径去掉 `.md` 和扩展名，例如
`src/content/docs/guides/static-site.md` → `slug: 'guides/static-site'`。

## 版本注意事项

当前依赖：astro 7.3.x + @astrojs/starlight 0.42.6。

Starlight 0.42 与旧版本有几处不兼容改动：

| 旧写法 | 0.42 |
| --- | --- |
| `expressiveCode.shiki.langs` | 移到顶层 `markdown.shikiConfig.langs` |
| `lastUpdatedText` | 改为 i18n key `page.lastUpdated` |
| `i18n`（starlight 选项内） | 改为 `locales` + `src/content/i18n/*.json` collection |
| `pagination` | 仍支持 |
| `credits` | 仍支持 |

中文界面配置方式：

```js
starlight({
  defaultLocale: 'root',
  locales: { root: { label: '简体中文', lang: 'zh-CN' } },
})
```

文案放在 `src/content/i18n/zh-CN.json`，schema 用 `i18nSchema()` 导出。

## 用 Starlight 组件必须注意

**用 `Card` / `CardGrid` / `LinkCard` 等组件时，文件必须是 `.mdx` 而不是 `.md`。**

如果写成 `.md`，Markdown 会把 `import` 语句当成正文渲染出来（页面上出现一行
`import { Card } from '@astrojs/starlight/components';`），而 `<Card title="...">`
会被当成未知 HTML 标签 —— 属性全部丢失，卡片退化成裸文字。

同时还必须在 `astro.config.mjs` 里注册 `mdx()`：

```js
import mdx from '@astrojs/mdx';

export default defineConfig({
  integrations: [starlight({ /* ... */ }), mdx()],
});
```

三条缺一不可：`.mdx` 后缀 + `mdx()` 集成 + 清掉 `.astro` 缓存重建。

> 改名后如果仍不生效，删掉 `.astro/` 和 `dist/` 再构建。Astro 的内容层会缓存旧的条目。

## 覆盖 Footer 组件会丢掉哪些东西

自定义 `src/components/Footer.astro` 会**整体替换** Starlight 的默认页脚，
分页导航（上一篇/下一篇）、编辑链接、最后更新时间会一起消失。

要保留这些功能，在自定义 Footer 里显式渲染它们：

```astro
---
import Pagination from 'virtual:starlight/components/Pagination';
import EditLink from 'virtual:starlight/components/EditLink';
import LastUpdated from 'virtual:starlight/components/LastUpdated';
---

<Pagination />
<!-- 你自己的页脚设计 -->
<footer>...</footer>
```

注意 `LastUpdated` 依赖 git 历史。仓库没有提交记录时它渲染为空，这是正常的。

## 改主题 CSS 前先确认真实类名

Starlight 的类名不太直觉，**别照着记忆猜**。几个容易写错的：

| 猜的（错） | 实际（对） |
| --- | --- |
| `.sl-hero` | `.hero` |
| `.sl-markdown` | `.sl-markdown-content` |
| `.card-title` | `.card .title` |
| `.card-body` | `.card .body` |
| `.sidebar-group-label` | `.sidebar .group-label` |
| `.sidebar-item[aria-current='page']` | `.sidebar a[aria-current='page']` |

查真实类名的办法：构建后从产物 HTML 里把所有 `class` 抽出来。

```bash
node -e "
const h=require('fs').readFileSync('dist/index.html','utf8');
const s=new Set();
for(const m of h.matchAll(/class=\"([^\"]+)\"/g))
  m[1].split(/\s+/).forEach(c=>{ if(!/^astro-/.test(c)&&c) s.add(c) });
console.log([...s].sort().join('\n'));
"
```

另外 `--sl-color-*` 设计变量的语义在深浅色模式下是**反的**：浅色模式下
`--sl-color-white` 是深色文字、`--sl-color-black` 是白色背景。覆盖时对着
`node_modules/@astrojs/starlight/dist/style/props.css` 抄结构。

## 本地预览用的浏览器截图

项目里没装 Playwright/Chromium（要下 500MB）。Windows 上直接用系统自带的 Edge 做
headless 截图就够了：

```bash
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1440,1400 \
  --screenshot="$PWD/.workbuddy/shots/page.png" \
  --virtual-time-budget=7000 \
  "http://127.0.0.1:4321/"
```

## 部署

### 线上环境

| 项 | 值 |
| --- | --- |
| 地址 | **https://caddy.zidayo.com/** |
| 服务器 | `root@139.196.225.5`（AlmaLinux 10.2 + 1Panel / OpenResty） |
| 站点目录 | `/opt/1panel/1panel/www/sites/caddy.zidayo.com/index` |
| SSH 密钥 | `D:/WindTerm/WindTerm_2.7.0/ssh-key/fun.pem` |

一键部署：

```bash
bash deploy.sh
```

脚本会依次做：构建 → 打包 → 上传 → 服务器端备份旧版本 → 解压 → 修权限 → 验证。
备份自动保留最近 5 个，存放在服务器 `/opt/backup/`。

### 注意事项

**改域名一定要同步改 `site`。** `astro.config.mjs` 里的 `site` 决定 canonical、
OG 标签和 sitemap.xml 的域名，写错了 SEO 会指向别处。

**站点目录有两套，别搞混：**

```
/opt/1panel/1panel/www/sites/   ← 真正生效的（1Panel 在用）
/www/sites/                     ← 旧布局，只有 zidayo.com
```

**属主必须设为 `1000:1000`（即 `1panel:1panel`）。** 传成 `root:root` 的话，
1Panel 面板会对 `index` 及所有子目录/文件报「所有者和用户组需要设置为 1000」的警告。
`deploy.sh` 已经处理好了，手动部署时别漏掉这一句：

```bash
chown -R 1000:1000 /opt/1panel/1panel/www/sites/caddy.zidayo.com/index
```

权限用目录 `755`、文件 `644` 即可。

**这台机器不需要装 Caddy。** 80/443 由 1Panel 的 OpenResty 占用，
站点已配好 SSL 证书、HTTP/2 和 HSTS，直接把静态文件放进站点目录即可。

### 手动部署（不用脚本时）

```bash
# 1. 构建
npx astro build

# 2. 打包上传
tar czf /tmp/dist.tgz -C dist .
scp -i "$KEY" /tmp/dist.tgz root@139.196.225.5:/tmp/dist.tgz

# 3. 服务器端解压
ssh -i "$KEY" root@139.196.225.5 '
  S=/opt/1panel/1panel/www/sites/caddy.zidayo.com/index
  tar czf /opt/backup/caddy-$(date +%Y%m%d-%H%M%S).tgz -C "$S" .
  tar xzf /tmp/dist.tgz -C "$S"
  find "$S" -type d -exec chmod 755 {} \;
  find "$S" -type f -exec chmod 644 {} \;
  chown -R 1000:1000 "$S"
  rm -f /tmp/dist.tgz
'
```

### 纯静态托管的替代方案

产物就是普通静态文件，扔到任意托管都行：

```bash
npm run preview     # 本地预览构建产物
npx serve dist      # 任意静态服务器
```

需要 Node 20.11+（Starlight 0.42 要求 Astro 7）。