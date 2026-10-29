// @ts-check
import { readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mdx from '@astrojs/mdx';

// 自定义 Caddyfile 语法高亮（Shiki 自带的语言包里没有 caddyfile）
const caddyfileGrammar = JSON.parse(
  readFileSync(new URL('./src/shiki/caddyfile.tmLanguage.json', import.meta.url), 'utf8')
);
caddyfileGrammar.name = 'caddyfile';
caddyfileGrammar.aliases = ['caddy', 'Caddyfile', 'Caddy'];

// https://astro.build/config
export default defineConfig({
  site: 'https://caddy.zidayo.com',
  trailingSlash: 'ignore',
  markdown: {
    shikiConfig: {
      langs: [caddyfileGrammar],
      langAlias: { caddy: 'caddyfile' },
    },
  },
  integrations: [
    starlight({
      title: 'Caddy 文档',
      description:
        '用 Caddyfile 写反向代理，自动 HTTPS，以及一切你需要的现代 Web 服务器配置。中文、清晰、可搜索。',
      logo: {
        src: './src/assets/caddy-logo.svg',
      },
      favicon: '/favicon.svg',
      customCss: ['./src/styles/theme.css'],
      // 中文界面
      defaultLocale: 'root',
      locales: {
        root: { label: '简体中文', lang: 'zh-CN' },
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/caddyserver/caddy',
        },
      ],
      // 编辑链接指向本站自己的内容仓库（不是 Caddy 官方仓库）
      editLink: {
        baseUrl: 'https://github.com/maomaoz5/caddy-docs/edit/main/',
      },
      lastUpdated: true,
      pagination: true,
      credits: false,
      head: [
        {
          tag: 'meta',
          attrs: { name: 'theme-color', content: '#4a8cff' },
        },
        {
          tag: 'meta',
          attrs: {
            name: 'keywords',
            content: 'Caddy, Caddyfile, 反向代理, 自动 HTTPS, Web 服务器',
          },
        },
        // 社交分享预览图（1200x630）
        {
          tag: 'meta',
          attrs: { property: 'og:image', content: 'https://caddy.zidayo.com/og.png' },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:image:width', content: '1200' },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:image:height', content: '630' },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:image:alt', content: 'Caddy 中文文档' },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:site_name', content: 'Caddy 文档' },
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:card', content: 'summary_large_image' },
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:image', content: 'https://caddy.zidayo.com/og.png' },
        },
      ],
      components: {
        Footer: './src/components/Footer.astro',
      },
      sidebar: [
        {
          label: '入门',
          collapsed: false,
          items: [
            { label: '什么是 Caddy', slug: 'index' },
            { label: '快速开始', slug: 'getting-started/installation' },
            { label: '第一个 Caddyfile', slug: 'getting-started/first-caddyfile' },
          ],
        },
        {
          label: '核心概念',
          collapsed: false,
          items: [
            { label: '配置结构', slug: 'concepts/structure' },
            { label: '指令速查', slug: 'concepts/directives' },
            { label: '匹配器', slug: 'concepts/matchers' },
            { label: '处理指令', slug: 'concepts/handlers' },
            { label: '变量', slug: 'concepts/variables' },
          ],
        },
        {
          label: '实战',
          collapsed: false,
          items: [
            { label: '自动 HTTPS', slug: 'guides/https' },
            { label: '反向代理', slug: 'guides/reverse-proxy' },
            { label: '静态站点', slug: 'guides/static-site' },
            { label: '负载均衡', slug: 'guides/load-balancing' },
            { label: 'WebSocket', slug: 'guides/websocket' },
            { label: '实战配置库', slug: 'guides/recipes' },
            { label: '安全加固', slug: 'guides/security' },
          ],
        },
        {
          label: '进阶',
          collapsed: false,
          items: [
            { label: '构建 JSON 配置', slug: 'advanced/json-config' },
            { label: '自定义日志', slug: 'advanced/logging' },
            { label: '性能调优', slug: 'advanced/performance' },
            { label: '常见坑', slug: 'advanced/pitfalls' },
          ],
        },
        {
          label: '参考',
          collapsed: false,
          items: [
            { label: '命令行 CLI', slug: 'reference/cli' },
            { label: '全局选项', slug: 'reference/options' },
            { label: 'Go 集成', slug: 'reference/go' },
          ],
        },
      ],
    }),
    mdx(),
  ],
});