---
title: 实战配置库
description: 十几个可以直接抄的生产配置模板。
---

这是本站最实用的一页——每一节都是一个完整的生产配置，按需修改域名和端口就能用。

## 静态博客（Astro / Hugo / VitePress）

```caddy
blog.example.com {
    root * /var/www/blog
    encode gzip zstd

    # HTML 入口不缓存，静态资源按构建产物指纹永久缓存
    @static path /assets/* /_astro/* /_app/*
    handle @static {
        header Cache-Control "public, max-age=31536000, immutable"
        file_server
    }
    handle {
        try_files {path} /index.html
        header Cache-Control "no-cache"
        file_server
    }
}
```

## 单页应用（SPA）

所有路径回退到 `index.html`，前端路由自己接管：

```caddy
app.example.com {
    root * /var/www/app
    try_files {path} /index.html
    encode gzip zstd
    file_server
}
```

## 反代单个后端（最常用）

```caddy
api.example.com {
    encode gzip zstd
    reverse_proxy 127.0.0.1:8080 {
        header_up X-Real-IP {http.request.remote.ip}
        header_up X-Forwarded-Proto {http.request.scheme}
    }
}
```

后端只监听 `127.0.0.1` 时，请务必确认它在监听 `0.0.0.0` 或容器可达地址，否则 502。

## 反向代理 + WebSocket

零配置即可，无需 `Upgrade` 头：

```caddy
chat.example.com {
    reverse_proxy localhost:3001
}
```

如果 SSE 或长轮询收不到数据，加 `flush_interval -1`。

## 按路径分流到不同后端

```caddy
example.com {
    handle_path /api/* {
        reverse_proxy localhost:8080
    }
    handle_path /ws/* {
        reverse_proxy localhost:3001
    }
    handle {
        root * /var/www/site
        file_server
    }
}
```

`handle_path` 自动剥掉前缀：`/api/users?page=2` 到后端变成 `/users?page=2`。

## 多后端负载均衡 + 故障转移

```caddy
api.example.com {
    reverse_proxy backend1:8080 backend2:8080 backend3:8080 {
        lb_policy least_conn
        lb_retries 3
        lb_try_duration 5s
        fail_duration 30s
        health_uri /healthz
        health_interval 30s
        health_timeout 5s
    }
}
```

## Basic Auth 保护管理后台

先生成 bcrypt 哈希：

```bash
caddy hash-password --plaintext '你的密码'
```

然后：

```caddy
admin.example.com {
    basic_auth {
        ops $2a$14$rTqJTKfzWjEqOwQ7YHtY1OsZRX7fO8He6cJy0Q2mZ5b8uGMOlCzO
    }
    reverse_proxy localhost:9000
}
```

密码哈希**不能明文写**，必须先 `caddy hash-password`。

## IP 白名单（内网服务）

```caddy
internal.example.com {
    @allowed remote_ip 192.168.0.0/16 10.0.0.0/8 203.0.113.7
    handle @allowed {
        reverse_proxy localhost:8080
    }
    handle {
        respond "403 Forbidden" 403
    }
}
```

## 内网 IP 直接上 HTTPS（无公网域名）

```caddy
https://192.168.1.10 {
    tls internal
    respond "hello"
}
```

浏览器会警告自签证书；把 Caddy 的根证书（`caddy trust` 导出）导入系统信任库即可消除。

## 临时文件服务器（局域网网盘）

```caddy
:8080 {
    root * /srv/share
    file_server browse
}
```

`:8080` 不带域名 → 不会触发自动 HTTPS，局域网直接 HTTP 访问。

## 旧域名 301 到新域名

```caddy
old.example.com {
    redir https://example.com{uri} 301
}
```

保留路径和 query string。

## www 与非 www 合并

```caddy
www.example.com {
    redir https://example.com{uri} 301
}
example.com {
    respond "主站"
}
```

## 自定义错误页

```caddy
example.com {
    root * /var/www/site
    file_server
    handle_errors {
        @404 expression {http.error.status_code} == 404
        rewrite @404 /404.html
        file_server
    }
}
```

## 重定向到 HTTPS + 保留原始 URI

全局兜底（写在 Caddyfile 顶层，匹配所有未显式配置的 HTTP 请求）：

```caddy
{
    # 让所有 HTTP 请求跳 HTTPS
}

http:// {
    redir https://{host}{uri} 301
}
```

多数场景不用写这个——自动 HTTPS 默认就会跳转，这是兜底用的。

:::tip[阅读顺序]
还没搞懂配置结构的话，先看[配置结构](/concepts/structure/)和[处理指令](/concepts/handlers/)，
这些配方都是那套语法的组合应用。
:::
