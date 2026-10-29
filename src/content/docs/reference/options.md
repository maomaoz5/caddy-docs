---
title: 全局选项
description: 写在文件最外层的花括号选项。
---

全局选项必须写在 Caddyfile **最开头**的一个花括号块里，位置不对会报语法错误。

```caddy
{
    admin off
    http_port 8080
    https_port 8443
}

example.com {
    respond "ok"
}
```

## 常用全局选项

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `admin` | `localhost:2019` | Admin API 监听地址 |
| `http_port` | 80 | HTTP 端口 |
| `https_port` | 443 | HTTPS 端口 |
| `default_bind` | 无 | 所有服务器的默认绑定地址 |
| `grace_period` | 无 | 优雅停机等待时长 |
| `log` | stderr | 全局默认日志 |
| `email` | 无 | ACME 注册邮箱 |
| `auto_https` | 开启 | 全局自动 HTTPS 开关 |
| `order` | 内置 | 指令的全局排序 |
| `storage` | 默认 | 存储后端（文件系统 / vault） |
| `certificate_loaders` | files,pem | 证书加载顺序 |

## 改端口

做本地开发或避免和现有服务冲突：

```caddy
{
    http_port 8080
    https_port 8443
}

example.com:8080 {
    respond "dev"
}
```

注意：**地址位也要同步改**。只改全局端口但地址还是 `:80`，请求还是打不到。

## 关闭 Admin API

```caddy
{
    admin off
}
```

关闭后 `caddy reload` 不可用，只能 `restart`。容器里这样做是合理的——用进程管理器重启代替热加载。

## 优雅停机

```caddy
{
    grace_period 30s
}
```

收到停止信号后，Caddy 会先停止接受新连接，等已有请求完成（最多 30 秒）再退出。

长连接场景（WebSocket、上传）要注意：这个时间得够长，否则正在传输的连接会被掐断。

## 指令排序

`order` 全局决定指令的执行顺序。**这是让某些组合生效的关键**：

```caddy
{
    order rate_limit before basic_auth
    order encode before reverse_proxy
}
```

顺序声明错了，写出来的配置就是静默失效——不报错，就是不生效。

:::tip
改顺序前先 `caddy adapt --pretty` 看适配结果。如果你加的指令在 JSON 里跑到了它不该在的位置，问题就在这。
:::

## ACME 邮箱

```caddy
{
    email admin@example.com
}
```

这是 ACME 账户注册邮箱，用于证书到期和安全告警。不设也能跑，但建议设——出问题时会收到通知。

## 自定义存储

```caddy
{
    storage file_system {
        root /var/lib/caddy
    }
}
```

默认就是文件存储，存在 `~/.local/share/caddy`。Docker 里对应 `/data`。目录一定要持久化，否则证书每次都重新申请。

## 完整的实践配置

```caddy
{
    email admin@example.com
    admin localhost:2019
    grace_period 30s

    order rate_limit before basic_auth

    servers {
        protocols h1 h2 h3
        timeouts {
            read_body 30s
            idle 5m
            write 0
        }
    }

    log {
        output file /var/log/caddy/caddy.log {
            roll_size 100MiB
            roll_keep 10
            roll_keep_for 720h
        }
        level INFO
    }
}

example.com {
    root * /var/www/html
    encode gzip zstd
    file_server

    reverse_proxy /api/* localhost:3000
}
```

## 语法错误的表现

```caddy
{
    admin off
}

example.com {
    respond "ok"
}

{
    email a@example.com     # ✗ 第二个全局块
}
```

```
Error: parsing caddyfile: global options must appear before any other directives
```

全局块只能有一个，而且必须在最前面。