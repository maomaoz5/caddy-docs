---
title: 自定义日志
description: 日志格式、轮转、写入文件与多环境。
---

## 默认日志

```caddy
example.com {
    log
    reverse_proxy localhost:3000
}
```

输出到 stderr（systemd 下就是 journal），JSON 行格式，包含时间、状态码、耗时等。

想同时写文件：

```caddy
log {
    output file /var/log/caddy/access.log {
        roll_size 100MiB
        roll_keep 10
        roll_keep_for 720h
    }
}
```

`roll_keep` 是保留的文件数，`roll_keep_for` 是最长保留时长。两个一起设，防止日志把磁盘吃满——这个组合漏了的话，几个月后你的服务器会因为 inode 耗尽而挂掉。

## 自定义格式

```caddy
log {
    format json {
        time_format iso8601
        level_info
    }
}
```

| 格式 | 用途 |
| --- | --- |
| `json` | 结构化，默认，给日志系统采集 |
| `console` | 人类可读彩色输出，本地调试 |
| `logfmt` | key=value，给传统工具 |

字段级别的过滤：

```caddy
log {
    format filter {
        wrap json
        fields {
            uri query {
                replace foo REDACTED
            }
        }
    }
}
```

## 脱敏

日志里经常混进敏感信息：

```caddy
log {
    format filter {
        wrap json
        fields {
            request>headers>Authorization delete
            request>headers>Cookie delete
            request>headers>X-Api-Key delete
        }
    }
}
```

把整个头删掉：

```caddy
fields {
    request>headers delete
}
```

只保留关心的头：

```caddy
fields {
    request>headers {
        include User-Agent Content-Type Accept
    }
}
```

:::danger[别把 token 写进日志]
`Authorization` 头落进日志文件，就等于把凭证写在了磁盘上。日志文件通常权限宽松、备份多份、还可能被日志平台长期留存——比数据库更容易泄露。这条不是可选项。
:::

## 按环境分流

```caddy
example.com {
    @prod {
        host example.com
        remote_ip 1.2.3.4/32
    }
    log @prod {
        output file /var/log/caddy/prod.log
        level ERROR WARN
    }
    log {
        output stdout
        level DEBUG
    }
}
```

## 错误日志单独开

```caddy
example.com {
    log {
        output stderr
        level ERROR
    }
}
```

注意：`level ERROR` 只过滤日志级别，**不会**只记录 4xx/5xx。想按状态码过滤要用日志处理器：

```caddy
log {
    output stderr
    include http.log.access.stuff
    level ERROR
}
```

## 日志轮转

Caddy 内置轮转，不依赖 logrotate。但如果你已有 logrotate 体系：

```
/var/log/caddy/*.log {
    daily
    missingok
    rotate 14
    compress
    postrotate
        systemctl reload caddy
    endscript
}
```

:::caution
别同时让 Caddy 和 logrotate 管同一个文件。两边都轮转会互相打断：Caddy 正往里写的文件被 logrotate 移走了，日志就断了。
:::

## 排查用日志

临时加更多上下文：

```caddy
example.com {
    log {
        output stderr
        level DEBUG
    }
    reverse_proxy localhost:3000 {
        header_up X-Request-Log-ID {http.request.uuid}
    }
}
```

`{http.request.uuid}` 每次请求生成一个唯一 ID，打进日志后就能顺着追踪。

## logrotate vs 内置轮转

| | Caddy 内置 | logrotate |
| --- | --- | --- |
| 配置位置 | Caddyfile | 系统配置 |
| 压缩 | 不支持 | 支持 |
| 跨文件时间对齐 | 不支持 | 支持 |
| reload 无需处理 | 支持 | 需要 postrotate |
| 磁盘用量控制 | 支持（roll_size + roll_keep） | 支持 |

:::tip
只有一种日志文件 + 想少一处配置 → 用内置轮转。日志量大、需要压缩、需要和其他日志统一归档 → 用 logrotate，但记得把Caddy 的 `roll_*` 配置去掉。
:::