---
title: 指令速查
description: 常用 Caddyfile 指令一页速览，含每类的关键用法。
---

按用途分类，每类给出最常用的指令和最小示例。完整语法参考官方文档的 directives 页。

## 路由与响应

| 指令 | 作用 | 最小示例 |
| --- | --- | --- |
| `reverse_proxy` | 反向代理 | `reverse_proxy localhost:3000` |
| `file_server` | 静态文件服务 | `file_server` |
| `respond` | 直接返回固定响应 | `respond "hi" 200` |
| `root` | 设置站点根目录 | `root * /var/www` |
| `try_files` | 存在性检查 + 回退 | `try_files {path} /index.html` |
| `redir` | 跳转 | `redir https://example.com{uri} 301` |
| `rewrite` | 改写路径 | `rewrite /old /new` |
| `uri` | 操作 URI | `uri strip_prefix /api` |
| `error` | 触发指定错误 | `error 503` |

`uri` 的子操作：`strip_prefix`、`strip_suffix`、`replace`、`path_regexp`：

```caddy
@api path /api/*
uri @api strip_prefix /api
```

## 分支与排序

| 指令 | 语义 |
| --- | --- |
| `handle` | 互斥分支，按书写顺序试，第一个命中即结束 |
| `handle_path` | 同 `handle`，自动剥掉匹配的路径前缀 |
| `handle_errors` | 捕获错误状态码，生成自定义错误响应 |
| `route` | 有序指令块，块内按书写顺序执行，不受默认排序影响 |
| `invoke` | 调用具名路由（需配合 `route` 命名） |

## 请求处理

| 指令 | 作用 | 备注 |
| --- | --- | --- |
| `encode` | 响应压缩 | `encode gzip zstd` |
| `request_body` | 请求体限制 | `request_body { max_size 10MB }` |
| `method` | 限定 HTTP 方法 | `method GET POST` |
| `header` | 响应头操作 | `header X-Frame-Options SAMEORIGIN` |
| `request_header` | 请求头操作 | `request_header -Accept-Encoding` |
| `basic_auth` | Basic 认证 | 哈希用 `caddy hash-password` 生成 |
| `vars` | 设置变量 | `vars foo bar`，占位符 `{vars.foo}` |
| `map` | 值映射 | 按输入映射输出到变量 |

`map` 示例（根据路径前缀设置不同后端）：

```caddy
map {http.request.uri.path.prefix} {backend} {
    /api    api:8080
    /web    web:3000
    default web:3000
}
reverse_proxy {backend}
```

## 静态文件

| 指令 | 作用 |
| --- | --- |
| `file_server` | 启用文件服务 |
| `file_server browse` | 生成目录列表页 |
| `file_server precompressed gzip br` | 直接发预压缩文件 |
| `index` | 设置目录索引文件名 | `index index.html` |

`hide` 挡住不该被下载的文件：

```caddy
file_server {
    hide .git .env *.bak
}
```

## TLS

| 指令 | 作用 |
| --- | --- |
| `tls` | 通用 TLS 配置块 |
| `tls internal` | 本地 CA 自签 |
| `tls { cert key }` | 指定自定义证书 |
| `tls { dns ... }` | DNS-01 验证 |
| `tls { issuer acme {...} }` | 指定 ACME CA |
| `tls { client_auth {...} }` | 客户端证书（mTLS） |
| `tls { resolvers ... }` | 指定解析器（DNS-01 场景） |

`tls` 块里的常用子配置：

```caddy
tls {
    protocols tls1.2 tls1.3
    curves x25519 secp384r1
    issuer acme {
        dir https://acme-staging-v02.api.letsencrypt.org/directory
    }
    client_auth {
        mode require_and_verify
        trusted_ca_file /path/ca.crt
    }
}
```

## 网络与超时（站点级）

| 指令 | 作用 |
| --- | --- |
| `bind` | 绑定特定 IP |
| `remote_ip` | 按来源 IP 匹配 |
| `timeouts` | 读写超时（站点级，覆盖全局） |

## 日志与调试

| 指令 | 作用 |
| --- | --- |
| `log` | 访问日志（格式、输出、字段过滤） |
| `debug` | 输出路由匹配决策到 stderr |
| `metrics` | 暴露 `/metrics` Prometheus 指标 |

```caddy
log {
    output file /var/log/caddy/example.com.log {
        roll_size 100MiB
        roll_keep 10
    }
    format json
    level ERROR
}
```

## 复用

| 指令 | 作用 |
| --- | --- |
| `import` | 引入片段或外部文件 |
| `snippets` | 括号命名的片段定义 |

```caddy
(common) {
    encode gzip
    header X-Frame-Options SAMEORIGIN
}

example.com {
    import common
    respond "ok"
}
```

## 控制指令顺序

默认顺序由 Caddy 内置排序决定，必要时可以全局调整：

```caddy
{
    order rate_limit before basic_auth
    order jwt before reverse_proxy
}
```

顺序写错会导致某些组合静默失效——先 `caddy adapt` 看翻译结果。

:::tip
完整指令清单（包括不常用的）在官方文档：
<https://caddyserver.com/docs/caddyfile/directives>。
本页只收录实际高频使用的。
:::
