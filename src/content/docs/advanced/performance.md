---
title: 性能调优
description: 连接数、超时、HTTP/3、编译选项。
---

## 先测量，别先调

```caddy
example.com {
    metrics {
        handle /metrics
    }
    reverse_proxy localhost:3000
}
```

关键指标：

| 指标 | 意义 |
| --- | --- |
| `caddy_http_request_duration_seconds` | 处理耗时，看 p99 |
| `caddy_http_response_duration_seconds` | 响应体传输耗时 |
| `caddy_http_requests_in_flight` | 在途请求数 |
| `go_goroutines` | goroutine 数量 |
| `process_resident_memory_bytes` | 常驻内存 |

优化之前先有基线。没数据就动手改，等于闭眼调参。

## 超时设置

```caddy
{
    servers {
        timeouts {
            read_body 30s
            read_header 10s
            idle 5m
            write 0
        }
        max_header_size 16KB
    }
}

example.com {
    reverse_proxy localhost:3000
}
```

| 超时 | 默认 | 建议 |
| --- | --- | --- |
| `read_header` | 10s | 保持默认 |
| `read_body` | 无 | 显式设上限，防慢速攻击 |
| `idle` | 5m | WebSocket 应用调大 |
| `write` | 无 | 流式响应设 0（不限制） |

:::caution[write 设 0 表示无限制]
SSE、大文件下载、长轮询这些场景下默认的写超时会导致连接被突然切断。但无限制也意味着慢速客户端能一直占着连接——所以前面得有反向防护或者限流。
:::

## HTTP/2 和 HTTP/3

```caddy
{
    servers {
        protocols h1 h2 h3
    }
}
example.com {
    reverse_proxy localhost:3000
}
```

HTTP/3 走 UDP 443。要求：

- 防火墙放通 **UDP 443**（很多云安全组默认只放 TCP）
- 客户端和服务端之间没有破坏 UDP 的中间设备
- 不支持时会自动回退到 HTTP/2，不会坏

放通 UDP 443 后可用 [HTTP/3 测试服务](https://http3check.net/) 验证。

## WebSocket 转 HTTP/2？

理论上 WebSocket over HTTP/2 更省连接，但浏览器兼容性还不够稳。Caddy 默认让WebSocket 走 HTTP/1.1 是有道理的，别为了「优化」去动它。

## 静态文件与 sendfile

Caddy 静态文件服务默认用 `sendfile` 系统调用，零拷贝。这类优化基本不用手动做。

能做的：

```caddy
example.com {
    root * /var/www/html
    encode gzip zstd
    file_server {
        precompressed br gzip
    }
}
```

`precompressed` 让Caddy 直接发你预压缩好的 `.br` / `.gz` 文件。构建时生成这些文件，能省掉每次请求的实时压缩 CPU。

## 构建时裁剪模块

```bash
xcaddy build --with github.com/caddy-dns/cloudflare --with github.com/mholt/caddy-ratelimit
```

`caddy list-modules` 看当前有多少个模块，删掉用不到的能减小二进制、减少启动时间和内存占用。

但别裁过头——很多「当前没用」的模块你会在某个深夜需要它，而重新编译比现成可用麻烦得多。

## 限流

反代前面被刷是常态：

```caddy
{
    order rate_limit before basic_auth
}

example.com {
    rate_limit {
        zone api {
            key {http.request.remote.ip}
            events 100
            window 1m
        }
    }
}
```

需要 `mholt/caddy-ratelimit` 模块：

```bash
xcaddy build --with github.com/mholt/caddy-ratelimit
```

## 连接数限制

```caddy
example.com {
    @tooMany {
        not remote_ip 192.168.0.0/16
        expression ...
    }
    respond @tooMany "Too many connections" 429
}
```

更实际的做法是用系统工具（`nginx` 那套 limit_req 逻辑）在更前面挡，比如 Cloudflare 或云厂商的 WAF。

## 连接复用

```caddy
reverse_proxy localhost:3000 {
    transport http {
        keepalive 30s
        keepalive_idle_conns 32
    }
}
```

上游连接池。机器上有很多反代目标时，调大 `keepalive_idle_conns` 能减少握手开销。

## 内存

- 大文件上传会占用内存做缓冲，`request_body` 限小能显著降低峰值。
- 日志级别调高会增加内存和磁盘 IO，生产别开 `DEBUG`。
- `max_header_size` 别设太大，每个请求都要预留这个量级的 buffer。

## 调优 checklist

```bash
# 1. 先确认瓶颈在Caddy 还是上游
curl -w "connect: %{time_connect}s\nttfb: %{time_starttransfer}s\ntotal: %{time_total}s\n" \
  -o /dev/null -s https://example.com

# 2. 确认 ttfb 大 => 上游慢，Caddy 无能为力
#    确认 ttfb 小但 total 大 => 传输慢，查带宽/响应体大小
```

:::tip
如果 `time_starttransfer` 就已经很大，问题在上游应用，调 Caddy 没用。只有当 ttfb 小但总耗时长时，才该从压缩、缓存、HTTP/3 这些方向下手。
:::