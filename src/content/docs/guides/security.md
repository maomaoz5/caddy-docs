---
title: 安全加固
description: 响应头、认证、访问控制、mTLS、限速等加固手段。
---

Caddy 默认配置已经比多数 Web 服务器安全（自动 HTTPS、默认密码学、无版本号暴露），
这一页是加固清单，按场景选用。

## 1. 安全响应头

```caddy
(security) {
    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "camera=(), microphone=(), geolocation=()"
        # CSP 按站点实际资源调整，先 Report-Only 观察
        Content-Security-Policy "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'"
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        -Server
        -X-Powered-By
    }
}
```

```caddy
example.com {
    import security
    reverse_proxy localhost:3000
}
```

要点：

- `-Server` 删掉后端泄漏的 Server 头，`-X-Powered-By` 同理
- HSTS 只对**确定全站 HTTPS** 的域名开 `preload`，开错很难撤销
- CSP 先换成 `Content-Security-Policy-Report-Only` 跑几天，收集违规报告再收紧

## 2. Basic Auth

```bash
# 生成哈希（把输出粘进配置）
caddy hash-password --plaintext '你的密码'
```

```caddy
admin.example.com {
    basic_auth {
        ops $2a$14$rTqJTKfzWjEqOwQ7YHtY1OsZRX7fO8He6cJy0Q2mZ5b8uGMOlCzO
    }
    reverse_proxy localhost:9000
}
```

Basic Auth 是明文 Base64 传输，**必须配合 HTTPS**，否则等于没设。

## 3. IP / CIDR 访问控制

```caddy
@intranet remote_ip 192.168.0.0/16 10.0.0.0/8
handle @intranet {
    reverse_proxy localhost:8080
}
handle {
    respond "403" 403
}
```

只对内网开放时，比 Basic Auth 更可靠——不依赖密码强度。

## 4. 客户端证书认证（mTLS）

适合 API 到 API 的内部调用，或管理接口：

```caddy
api.example.com {
    tls /etc/caddy/certs/server.crt /etc/caddy/certs/server.key {
        client_auth {
            mode require_and_verify
            trusted_ca_file /etc/caddy/certs/ca.crt
        }
    }
    reverse_proxy localhost:8080
}
```

`mode` 可选：

| 值 | 含义 |
| --- | --- |
| `request` | 要求客户端提供证书（可验证失败） |
| `require` | 必须提供证书，但不必验证 |
| `verify_if_given` | 给了就验证，不给也放行 |
| `require_and_verify` | 必须提供且必须验证 |

## 5. 限速

核心版没有限速指令，需要编译插件：

```bash
xcaddy build --with github.com/mholt/caddy-ratelimit
```

```caddy
{
    order rate_limit before basic_auth
}

api.example.com {
    rate_limit {
        zone api {
            key {http.request.remote.ip}
            events 100
            window 1m
        }
        zone login {
            key {http.request.remote.ip}
            events 5
            window 1m
        }
    }
    reverse_proxy localhost:8080
}
```

针对登录接口可以给单独 zone，阈值更低。

## 6. 防目录穿越 / 隐藏敏感文件

`file_server` 的 `hide` 参数把这些文件挡在直接访问之外：

```caddy
example.com {
    root * /var/www/site
    file_server {
        hide .git .env .htaccess *.bak *.sql
    }
}
```

已经有规则挡 `.git` 等路径时，nginx 风格的全局拦截也顺手做了。

## 7. 自动 HTTPS 的开关细节

```caddy
{
    auto_https prefer_wildcard
}
```

```caddy
internal.example.com {
    tls internal
    respond "ok"
}
```

- 不想对某个站点启用 HTTPS：站点块地址写 `:8080` 或 `http://` 前缀
- 全局关闭自动 HTTPS（很少需要）：`{ auto_https off }`

## 8. 与 fail2ban 配合

Caddy 的 JSON 日志里直接有状态码和来源 IP，fail2ban 可以解析：

```caddy
example.com {
    log {
        output file /var/log/caddy/access.log
        format json
    }
}
```

fail2ban 的 filter 匹配 `status` 字段即可（比如拦截重复 401/403 的 IP），不需要像 nginx 那样写复杂正则。

## 加固 checklist

- [ ] 安全响应头（HSTS 谨慎 preload）
- [ ] 敏感接口加 Basic Auth 或 mTLS
- [ ] 管理后台限来源 IP
- [ ] `hide` 挡住 `.git` `.env` 备份文件
- [ ] 登录接口单独限速
- [ ] 日志打开，fail2ban 监控
- [ ] 证书自动续期确认（`caddy adapt` 查一下）
