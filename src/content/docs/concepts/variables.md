---
title: 变量
description: 在 Caddyfile 里引用运行时值的语法，含完整占位符表。
---

## 占位符语法

Caddyfile 支持三种引用语法，注意区别：

| 语法 | 含义 |
| --- | --- |
| `{http.request.uri}` | **Caddyfile 占位符**——请求处理时替换 |
| `{$ENV_VAR}` | **环境变量**——启动时由 shell / systemd 注入 |
| `{env.ENV_VAR}` | 运行时环境变量占位符 |

```caddy
{$DOMAIN} {
    reverse_proxy localhost:9000
}
```

环境变量带默认值：

```caddy
api.example.com {
    reverse_proxy {$API_BACKEND:localhost:8080}
}
```

- `{$VAR}` 只在**启动时**展开一次，改环境变量需要重启
- `{env.VAR}` 每次请求时读取，适合偶尔变化的值

:::caution[不要把秘密直接写进 Caddyfile]
证书私钥、数据库密码这些放 systemd 的 `EnvironmentFile`，Caddyfile 里只留占位符。Caddyfile 通常是明文提交进仓库的。
:::

## 请求相关占位符

| 占位符 | 内容 |
| --- | --- |
| `{http.request.method}` | GET / POST |
| `{http.request.proto}` | HTTP/1.1、HTTP/2.0、HTTP/3.0 |
| `{http.request.host}` | Host 头 |
| `{http.request.port}` | 请求端口 |
| `{http.request.remote}` | 客户端地址 IP:port |
| `{http.request.remote.host}` | 仅 IP |
| `{http.request.remote.port}` | 仅端口 |
| `{http.request.scheme}` | http / https |
| `{http.request.uri}` | 完整 URI，含 query |
| `{http.request.uri.path}` | 仅路径 |
| `{http.request.uri.path_dir}` | 路径所在目录 |
| `{http.request.uri.query}` | query string |
| `{http.request.uri.query.foo}` | query 中 `foo` 的值 |
| `{http.request.header.Cookie}` | 指定请求头 |
| `{http.request.body}` | 请求体（需开启 body 读取） |
| `{http.request.tls.version}` | TLS 版本 |
| `{http.request.tls.cipher_suite}` | 密码套件 |

## 响应相关占位符

| 占位符 | 内容 |
| --- | --- |
| `{http.response.status}` | 响应状态码 |
| `{http.response.header.X-Foo}` | 响应头 |
| `{http.response.upstream_latency}` | 上游耗时 |
| `{http.response.duration}` | 总处理耗时 |

## 错误相关占位符

| 占位符 | 内容 |
| --- | --- |
| `{http.error.status_code}` | 错误状态码 |
| `{http.error.status_text}` | 状态文本 |
| `{http.error.message}` | 错误详情 |
| `{http.error.trace}` | 错误堆栈 |

## 其他

| 占位符 | 内容 |
| --- | --- |
| `{host}` | 当前站点块地址 |
| `{env.PATH}` | 环境变量 |
| `{vars.foo}` | `vars` 指令设置的变量 |
| `{labels.N}` | 通配符域名的第 N 段标签 |
| `{time.now}` / `{time.now.http}` | 当前时间 |
| `{file./path/to/file}` | 文件内容 |
| `{http.request.uuid}` | 请求唯一 ID（需开启日志） |

## 实战：条件跳转

```caddy
example.com {
    @www host www.example.com
    redir @www https://example.com{uri} 301
}
```

`@www` 定义了匹配器，`redir` 接受匹配器作为第一个参数——所以不会把所有请求都跳走。

## 实战：把上游耗时暴露成头

```caddy
reverse_proxy localhost:3000 {
    header_up X-Upstream-Latency {http.response.upstream_latency}
}
```

:::caution[header_up 是给上游的请求头]
`header_up` 加到**发往后端**的请求上；`header` 加到**返回给客户端**的响应上。想让后端看到真实客户端 IP，就得用 `header_up X-Real-IP {http.request.remote.ip}`，写错方向的话后端永远拿不到。
:::

## 实战：vars 自定义变量

```caddy
example.com {
    vars backend_prod prod-api:8080
    vars backend_staging staging-api:8080

    @prod host api.example.com
    handle @prod {
        reverse_proxy {vars.backend_prod}
    }
    handle {
        reverse_proxy {vars.backend_staging}
    }
}
```

配合 `map` 指令可以做更复杂的值映射（见[指令速查](/concepts/directives/)）。

## 反代时透传客户端信息

```caddy
reverse_proxy localhost:3000 {
    header_up Host {host}
    header_up X-Real-IP {http.request.remote.ip}
    header_up X-Forwarded-Proto {http.request.scheme}
}
```

Caddy 默认已经会设置 `X-Forwarded-For` / `X-Forwarded-Proto` / `X-Forwarded-Host`，一般不用手动写。只有当你有嵌套代理（Caddy 前面还有一层 Nginx/Cloudflare）时才需要特别处理。

## 环境变量注入

```bash
sudo systemctl edit caddy
```

```ini
[Service]
Environment="DOMAIN=example.com"
Environment="API_BACKEND=localhost:8080"
EnvironmentFile=/etc/caddy/caddy.env
```

改完 `sudo systemctl restart caddy`（环境变量变更需要重启，`reload` 不够）。

:::tip
完整占位符清单见官方文档：<https://caddyserver.com/docs/conventions#placeholders>。
表里没有的可以用 `{http.handlers.*}` 系列的深层占位符探索——配合 `debug` 日志看实际值。
:::
