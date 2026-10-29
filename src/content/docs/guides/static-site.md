---
title: 静态站点
description: 托管 HTML、构建产物、SPA 和多站点。
---

## 最小配置

```caddy
example.com {
    root * /var/www/html
    file_server
}
```

`root *` 的星号是必须的——它表示后面那个值是一个路径列表，而不是字面量。这写法初看很怪，但 Caddyfile 就这样。

## SPA 路由回退

前端应用刷新 `/settings` 直接404，因为构建产物里只有 `index.html`。解决：

```caddy
example.com {
    root * /var/www/dist
    try_files {path} /index.html
    file_server
}
```

`try_files` 依次检查，第一个存在的就返回；全都不存在则回退到 `/index.html`。

有静态资源前缀时更精确一点：

```caddy
@assets path /assets/* /favicon.ico /manifest.json
handle @assets {
    root * /var/www/dist
    file_server
}
handle {
    root * /var/www/dist
    try_files {path} /index.html
    file_server
}
```

这样 `/assets/` 下的文件不存在就是真404，而不是被 SPA 回退吞掉。

## 缓存策略

带 hash 的构建产物可以永久缓存，HTML 入口不能：

```caddy
example.com {
    root * /var/www/dist

    @static path /assets/* /_astro/* /fonts/*
    header @static Cache-Control "public, max-age=31536000, immutable"

    @html path / /index.html
    header @html Cache-Control "no-cache"

    file_server
}
```

`no-cache` 不是「不缓存」，是「缓存了也要回源校验」。入口 HTML 用它，用户的版本切换才不会被缓存卡住。

## 压缩

```caddy
example.com {
    root * /var/www/dist
    encode gzip zstd
    file_server
}
```

## 上传目录

```caddy
uploads.example.com {
    root * /srv/uploads
    file_server browse
}
```

`browse` 会生成目录列表页，方便临时当网盘用。

:::danger[别把browse 开在有隐私的目录]
它等于公开可浏览的文件索引。至少限制来源 IP：

```caddy
@private not remote_ip 192.168.0.0/16
respond @private "Forbidden" 403
```
:::

## 上传限制

```caddy
upload.example.com {
    root * /srv/uploads
    request_body {
        max_size 100MB
    }
    file_server
}
```

## 缓存键

```caddy
example.com {
    root * /var/www/html
    file_server {
        hide .git
        hide *.bak
    }
}
```

`hide` 可以挡住敏感文件被直接下载——比如误传上去的 `.env`。

## 托管多个站点

```caddy
(a.example.com) {
    root * /var/www/a
    file_server
}

(b.example.com) {
    root * /var/www/b
    file_server
}

*.example.com {
    root * /var/www/default
    file_server
}
```

括号片段 + `import` 复用，比复制粘贴可靠得多。

## 与框架的 dev 模式配合

```caddy
:5173 {
    reverse_proxy localhost:5173
}
```

Vite / Next.js / Nuxt 的 dev server 固定端口，Caddy 当一层入口，Cookie 域名就能统一在 `.example.com` 下了。

:::tip[Caddy 和 dev server 抢端口怎么办]
dev server 通常用热更新推送（HMR WebSocket），反代后要确认 `Access-Control-Allow-Origin` 和 HMR 的 host 配置能对上。Vite 要设 `server.hmr.clientPort` 为 Caddy 的对外端口，否则浏览器连 HMR 会一直重连。
:::