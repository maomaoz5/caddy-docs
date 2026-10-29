---
title: 反向代理
description: 从最简到进阶的反向代理完整配置手册。
---

## 一行版本

```caddy
app.example.com {
    reverse_proxy localhost:3000
}
```

WebSocket、gRPC、SSE、长连接都自动处理。真的，就这一行。

## 负载均衡

```caddy
app.example.com {
    reverse_proxy localhost:3000 localhost:3001 localhost:3002
}
```

默认策略是**轮询**。被动健康检查会自动剔除故障节点——这是它比 Nginx 默认配置省事的地方。

## 主动健康检查

```caddy
app.example.com {
    reverse_proxy localhost:3000 {
        health_uri /healthz
        health_interval 30s
        health_timeout 5s
        health_status 2xx
    }
}
```

`health_interval` 建议 10~60s，太短会给后端制造无谓的压力。`health_uri` 里放**轻量**的端点，别在里面查数据库。

## 负载均衡策略

```caddy
lb_policy <策略>
```

| 策略 | 说明 |
| --- | --- |
| `first` | 总是用第一个可用节点 |
| `round_robin` | 轮询（默认） |
| `random` | 随机选两个里连接数更少的 |
| `least_conn` | 选连接数最少的 |
| `ip_hash` | 按客户端 IP 哈希，会话保持 |
| `uri_hash` | 按请求 URI 哈希，缓存友好 |
| `header` | 按指定请求头哈希 |
| `cookie` | 按 cookie 哈希（服务端种 cookie） |
| `random_choose` | 随机选 N 个再从中选连接最少的 |

会话保持：

```caddy
lb_policy cookie SRVID 10m
```

`cookie` 策略由 Caddy 生成并下发 `SRVID` cookie，10 分钟内同一浏览器固定到同一节点。

## 故障转移与重试

```caddy
reverse_proxy {
    to localhost:3000 localhost:3001
    lb_policy round_robin
    lb_retries 3
    lb_try_duration 5s
    lb_retry_match {
        method GET HEAD
        status 502 503 504
    }
    fail_duration 30s
    max_fails 3
}
```

| 选项 | 作用 |
| --- | --- |
| `lb_retries` | 单个上游失败后重试次数 |
| `lb_try_duration` | 切换下一个上游前的等待窗口 |
| `lb_retry_match` | 哪些响应允许重试（见下方警告） |
| `fail_duration` | 节点被摘除的持续时间 |
| `max_fails` | 触发摘除的失败阈值 |
| `unhealthy_status` | 被动检查失败的状态码 |
| `unhealthy_latency` | 被动检查失败的最大延迟 |
| `unhealthy_requests` | 被动检查失败次数窗口 |

:::danger[重试非幂等请求是有代价的]
支付、下单、发短信这类接口被重试一次，业务侧可能就多一笔。生产环境务必把 `method` 限制在幂等方法上，宁可少一点可用性也别造重复数据。
:::

## 路径前缀剥离

后端不需要知道 `/api` 前缀存在：

```caddy
handle_path /api/* {
    reverse_proxy localhost:8080
}
```

`/api/users?page=2` → 后端收到 `/users?page=2`。

想更精细控制用 `rewrite` 或 `uri`：

```caddy
@api path /api/*
handle @api {
    uri strip_prefix /api
    reverse_proxy localhost:8080
}
```

## 修改上游请求

```caddy
reverse_proxy localhost:3000 {
    # 默认已经会设置 X-Forwarded-For / Proto / Host
    header_up Host {http.request.host}
    header_up X-Real-IP {http.request.remote.ip}

    # 删掉不希望后端看到的头
    header_up -Accept-Encoding
    header_up -X-Internal-Token
}
```

默认行为：Caddy 自动设置 `X-Forwarded-For`、`X-Forwarded-Proto`、`X-Forwarded-Host`。
**只有前面还有一层代理时才需要手动处理转发头**，否则后端拿到的都是正确的。

## 修改上游响应

```caddy
reverse_proxy localhost:3000 {
    header Cache-Control "public, max-age=3600"
    header -X-Powered-By
    header -Server
}
```

:::tip
`header -Server` 值得无条件加上。后端是谁、什么版本、装了哪些中间件，这些都是攻击者做指纹识别的免费情报。
:::

## 流式与长连接

SSE / 长轮询需要关掉缓冲：

```caddy
reverse_proxy localhost:3000 {
    flush_interval -1     # 每收到一块就立刻转发
    transport http {
        response_header_timeout 0   # 不限制响应头等待时间
    }
}
```

`flush_interval -1` 是低延迟流式响应的标准写法。不加的话内容会被攒着一起发，流式效果直接消失。

## transport http 常用选项

```caddy
reverse_proxy https://backend.internal:8443 {
    transport http {
        dial_timeout 10s                # 连接超时
        response_header_timeout 30s     # 等响应头的超时
        keepalive 30s                   # 上游连接池保活
        keepalive_idle_conns 100        # 空闲连接上限
        max_response_header 1MB         # 响应头大小上限
        max_conns_per_host 100          # 单主机并发上限
        compression off                 # 不对上游请求压缩
        tls_insecure_skip_verify        # 自签证书场景（慎用）
        tls_server_name backend.internal
        tls_timeout 10s
        versions h2 1.1                 # 允许的上游协议
        resolvers 8.8.8.8               # 指定 DNS
    }
}
```

要点：

- 上游是 HTTPS + 自签证书 → `tls_insecure_skip_verify` 只在内网开发用，生产换 `tls_trusted_ca_certs`
- HTTP/2 上游需要明确 `versions h2 1.1`，默认只走 HTTP/1.1
- `resolvers` 配合 Docker/内网 DNS 场景

## 处理上游错误响应

```caddy
reverse_proxy localhost:3000 {
    @error status 500 502 503
    handle_response @error {
        respond "服务暂时不可用" 503
    }
}
```

也可以返回自定义错误页：

```caddy
handle_response @error {
    rewrite * /error.html
    file_server
}
```

## 反代到 Docker 容器

```caddy
reverse_proxy app:3000
```

同一 Docker 网络内用服务名做 DNS 解析。宿主机场景用 `host.docker.internal` 而不是 `localhost`——容器里的 `localhost` 是容器自己，这个错误非常常见。

## 常见问题

| 现象 | 原因 |
| --- | --- |
| 502 Bad Gateway | 后端没起来、端口不对、监听 127.0.0.1 而容器外访问不到 |
| WebSocket 连上就断 | 反代后面套了另一个会超时的代理 |
| 大文件上传 413 | `request_body` 限制，或下游 nginx 的 `client_max_body_size` |
| SSE 半天不出数据 | 忘了 `flush_interval -1` |
| 301/302 循环 | 上游返回了 http 的 Location，但外层强制 https |
| gRPC 不通 | 上游需要 HTTP/2：`transport http { versions h2 }` |
| 首次请求慢 | 上游 DNS 解析或 TLS 握手，开 `keepalive` 复用连接 |

:::danger[上游只监听 127.0.0.1 会502]
这是最经典的坑：应用监听 `127.0.0.1:3000` 时，Docker 里的 Caddy 连的是容器网络地址，根本到不了。要让它监听 `0.0.0.0`，同时用防火墙限制只允许本机访问。
:::
