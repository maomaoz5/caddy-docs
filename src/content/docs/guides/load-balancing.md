---
title: 负载均衡
description: 多上游、策略选择、会话保持与健康检查。
---

## 基本形式

```caddy
example.com {
    reverse_proxy localhost:3000 localhost:3001 localhost:3002
}
```

没有额外配置就是轮询。这已经比大多数 Nginx 教程里手写的 upstream 块省事。

## 策略对比

```caddy
example.com {
    reverse_proxy {
        to localhost:3000 localhost:3001 localhost:3002
        lb_policy least_conn
    }
}
```

| 策略 | 何时用| 代价 |
| --- | --- | --- |
| `round_robin` | 后端性能一致、请求耗时接近 | 无 |
| `random` | 后端数量多（10+） | 无，分布更均匀 |
| `least_conn` | 请求耗时差异大（有的 10ms 有的 2s） | 每请求一次统计 |
| `ip_hash` | 需要按 IP 固定 |负载可能不均 |
| `header` | 需要粘性会话且客户端会带固定头 | 同上 |
| `cookie` | 需要会话保持 | 需下发 cookie |

:::tip
默认的 `round_robin` 在「同构后端」场景下表现最好。如果你的服务有长短请求混合，`least_conn` 通常能明显降低 P99 延迟。
:::

## 健康检查

```caddy
example.com {
    reverse_proxy localhost:3000 localhost:3001 {
        # 主动检查
        health_uri /healthz
        health_interval 30s
        health_timeout 5s

        # 被动检查（真实请求返回 5xx 也算失败）
        fail_duration 30s
        max_fails 3
    }
}
```

主动检查探测的是「进程还活着吗」，被动检查探测的是「真实业务请求成功吗」。两者都有才完整——主动检查能提前发现节点已死，被动检查能发现节点活着但业务已挂。

## 会话保持

**基于 cookie：**

```caddy
lb_policy cookie SRVID 10m
```

Caddy 会自己种一个 `SRVID` cookie 并保持 10 分钟。用户被固定到某个上游。

**基于请求头：**

```caddy
lb_policy header X-Session-Id
```

要求上游服务自己会带这个头（比如 JWT 的 jti，或者网关注入的会话 ID）。

**基于 IP：**

```caddy
lb_policy ip_hash
```

最省事，但有副作用：同一 NAT 出口的整个办公室会被打到同一个节点，负载可能严重倾斜。移动网络切基站还会掉节点，触发一次重新分配。

## 处理上游错误

```caddy
reverse_proxy localhost:3000 {
    @bad status 502 503 504
    handle_response @bad {
        respond "服务暂时不可用，请稍后重试" 503
    }
}
```

返回自定义的错误页也可以：

```caddy
reverse_proxy localhost:3000 {
    @bad status 500 502
    handle_response @bad {
        rewrite * /error.html
        file_server
    }
}
```

## 重试与熔断

```caddy
reverse_proxy {
    to localhost:3000 localhost:3001
    lb_retries 3
    lb_try_duration 5s
    lb_retry_match {
        status 502 503 504
    }
    fail_duration 30s
    max_fails 3
}
```

`lb_retry_match` 是关键：不加的话 POST 请求也可能被重试一遍——如果上游已经写库成功但响应丢了，重试就是重复下单。

```caddy
# 只对幂等请求重试
lb_retry_match {
    method GET HEAD OPTIONS
    status 502 503 504
}
```

:::danger[重试非幂等请求是有代价的]
支付、下单、发短信这类接口被重试一次，业务侧可能就多了一笔。生产环境务必把 `method` 限制加上，宁可少一点可用性也别造重复数据。
:::

## 观测

```caddy
example.com {
    reverse_proxy {
        to localhost:3000 localhost:3001
        lb_policy least_conn
    }

    # 暴露 Prometheus 指标
    metrics {
        handle /metrics
    }
}
```

关键指标：`caddy_http_requests_total`（按 upstream 标签）、`caddy_http_response_duration_seconds`（直方图）。后者按 p99 切片看，能直接告诉你哪个节点在拖后腿。

## 部署建议

```caddy
example.com {
    reverse_proxy localhost:3000 127.0.0.1:3001 {
        lb_policy least_conn
        health_uri /health
        health_interval 15s
    }
}
```

- 同机多实例用不同端口，跨机用内网 IP。
- 健康检查端点要**轻量**，别在里面查数据库，否则检查本身就会打垮数据库。
- `health_interval` 别低于 10s，检查请求本身也是负载。