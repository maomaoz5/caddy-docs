---
title: 匹配器
description: 用具名匹配器精确筛选请求的完整手册。
---

匹配器定义了「哪些请求走这段配置」。写成一个 `@名字` 开头的前缀指令。

## 匹配器类型一览

| 匹配器 | 说明 | 示例 |
| --- | --- | --- |
| `path` | URL 路径，支持 `*` 通配 | `@a path /api/*` |
| `path_regexp` | 路径正则 | `@b path_regexp \.(jpg\|png)$` |
| `method` | HTTP 方法 | `@m method GET HEAD` |
| `host` | Host 头 | `@h host example.com www.example.com` |
| `header` | 请求头精确/通配 | `@ua header User-Agent *bot*` |
| `header_regexp` | 请求头正则 | `@c header_regexp Accept text/html.*` |
| `query` | 查询参数 | `@q query page=1` |
| `remote_ip` | 来源 IP / CIDR | `@lan remote_ip 192.168.0.0/16` |
| `client_ip` | 同 remote_ip（语义更明确） | `@ip client_ip 10.0.0.0/8` |
| `protocol` | 应用层协议 | `@p protocol grpc` |
| `vars` | 占位符值匹配 | `@v vars {http.request.method} GET` |
| `vars_regexp` | 变量正则 | |
| `expression` | CEL 表达式（万能兜底） | `@e expression ...` |
| `file` | 文件存在性检查 | `@f file {path} index.html` |
| `not` | 取反（组合用） | `@n not method GET` |

## 组合逻辑

**同一匹配器里多值 = 或：**

```caddy
@api path /api/* /v1/* /v2/*
```

**大括号内多条 = 且：**

```caddy
@api {
    path /api/*
    method GET POST
}
```

**`not` 取反：**

```caddy
@notStatic not path /static/* /assets/*
handle @notStatic {
    reverse_proxy localhost:3000
}
```

**多个匹配器叠加（用第二条里的 `not` 排除第一条命中的）：**

```caddy
@api path /api/*
@static path /static/*

handle @api {
    reverse_proxy localhost:8080
}
handle @static {
    root * /var/www/static
    file_server
}
handle {
    reverse_proxy localhost:3000
}
```

`handle` 块天然互斥——这就是它的用途。

## path 的细节

- `path /api` 匹配**精确** `/api`
- `path /api/*` 匹配 `/api/` 下的所有路径
- `path *` 匹配一切
- `path /api*` 匹配 `/api`、`/apixxx`（前缀，但不包含 `/api/` 更深的路径）

推荐显式写 `/api/*`，语义最清楚。

## path_regexp 正则

```caddy
@images {
    path_regexp image \.(png|jpe?g|gif|webp|svg)$
}
handle @images {
    header Cache-Control "public, max-age=31536000, immutable"
    file_server
}
```

正则语法是 RE2（Go 的 regexp），**不支持反向引用和回溯**。复杂的嵌套量词慎写，性能开销大。

## header 匹配

```caddy
@mobile header User-Agent *Mobile*
@bot header User-Agent *bot* *crawler* *spider*

respond @bot "Forbidden" 403
```

## query 匹配

```caddy
@debug query debug=true
@page  query page=
```

- `debug=true` 匹配参数值精确为 `true`
- `page=` 匹配**存在**这个参数（值任意）

## remote_ip 与客户端 IP

```caddy
@internal remote_ip 192.168.0.0/16 10.0.0.0/8 127.0.0.1
handle @internal {
    respond "内网用户" 200
}
handle {
    respond "外部用户" 403
}
```

多层代理后想拿**真实客户端 IP**：用 `client_ip` 配合 `trusted_proxies` 声明上游代理地址，Caddy 会自动从 `X-Forwarded-For` 里解析。

## protocol 匹配

```caddy
@grpc protocol grpc
handle @grpc {
    reverse_proxy h2c://localhost:9000
}
```

## expression（CEL 表达式）

万能兜底，能表达其他匹配器表达不了的逻辑：

```caddy
@weird expression (
    {http.request.method} == 'POST' &&
    {http.request.uri.query}.contains('admin') &&
    !{http.request.header.Cookie}.contains('session=')
)
```

CEL 语法参考：<https://caddyserver.com/docs/caddyfile/matchers#expression>

:::tip[选择顺序]
能用 `path` 解决就别用正则，能用正则就别用 `expression`。表达式匹配器每次请求都要编译求值，是有真实成本的。
:::

## file 匹配器

静态站点里做「有文件就发文件，没有就回退」：

```caddy
@static file {path} index.html
handle @static {
    file_server
}
handle {
    reverse_proxy localhost:3000
}
```
