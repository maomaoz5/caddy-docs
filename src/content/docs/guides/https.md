---
title: 自动 HTTPS
description: 证书签发、续期、DNS 验证、自定义证书、协议与密码学配置的完整手册。
---

Caddy 的默认行为就是自动 HTTPS。你把域名写进地址位，它就自己去搞定证书——这是它相对 Nginx 最大的省心之处。

## 默认行为

```caddy
example.com {
    respond "ok"
}
```

这一行背后 Caddy 做了：

1. 监听 80 和 443
2. 解析域名 → 确认指向本机
3. ACME HTTP-01 验证，签发证书
4. 存到 `/var/lib/caddy/.local/share/caddy`（或容器里的 `/data`）
5. 自动续期（到期前 30 天开始）
6. HTTP 308 跳转到 HTTPS

## 内网 / 无公网 IP

没公网 IP 时 ACME 验证会失败。两个选择：

**方案一：内部 CA（开发环境够用）**

```caddy
https://internal.example.com {
    tls internal
    respond "ok"
}
```

Caddy 会自签一张证书。把这个 CA 的根证书（`caddy trust` 安装）加进系统信任库，浏览器就不报错了。

**方案二：DNS-01 验证（推荐，通配符必须用这个）**

HTTP-01 需要公网可达 80 端口，DNS-01 只需要操作 DNS 记录。

```caddy
*.example.com {
    tls {
        dns cloudflare {env.CF_API_TOKEN}
    }
    reverse_proxy localhost:9000
}
```

:::danger[API Token 别明文写]
用 `dns cloudflare {env.CF_API_TOKEN}`，token 放环境变量。这类密钥一旦进了 Git 历史，就得当泄露处理——去 Cloudflare 后台把旧 token 删掉重新生成。
:::

常见 DNS provider 的写法：

| Provider | 写法 | 备注 |
| --- | --- | --- |
| Cloudflare | `dns cloudflare {env.CF_API_TOKEN}` | 需 Zone.DNS 编辑权限的 token |
| Route53 | `dns route53` | 用 IAM role 或环境变量凭证 |
| DigitalOcean | `dns digitalocean {env.DO_TOKEN}` | |
| DuckDNS | `dns duckdns` | 免费域名场景 |
| AliDNS | `dns alidns` | 需要阿里云 AccessKey |
| DNSPod | `dns dnspod` | 腾讯云 |

完整列表：<https://caddyserver.com/docs/caddyfile/dns>

## 换 CA

```caddy
example.com {
    tls {
        issuer acme {
            ca https://acme.zerossl.com/v2/DV90
            email admin@example.com
        }
    }
}
```

默认是 Let's Encrypt 和 ZeroSSL 轮着用（保险起见，签发额度分开算）。也可以固定只用一个：

```caddy
tls {
    issuer acme {
        ca https://acme-v02.api.letsencrypt.org/directory
    }
}
```

## 自定义证书

已经买好的证书：

```caddy
example.com {
    tls /etc/caddy/certs/fullchain.pem /etc/caddy/certs/privkey.pem
}
```

## 协议与密码学校验

Caddy 默认 TLS 1.2 + 1.3，密码套件是 OpenSSL 的默认值（在 3.5+ 包含后量子混合密钥交换）。
一般不用动。要严格化的写法：

```caddy
example.com {
    tls {
        protocols tls1.2 tls1.3
        curves x25519 secp384r1
        ciphers TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
    }
}
```

- 密码套件只对 TLS 1.2 有效，TLS 1.3 的套件由协议决定，不可配
- 禁止 TLS 1.0/1.1 不需要配置——Caddy 默认就不支持

## 客户端证书（mTLS）

```caddy
api.example.com {
    tls {
        client_auth {
            mode require_and_verify
            trusted_ca_file /etc/caddy/certs/ca.crt
        }
    }
    reverse_proxy localhost:8080
}
```

`mode` 可选 `request` / `require` / `verify_if_given` / `require_and_verify`。

## 按需 TLS（on-demand）

对大量客户自定义域名（SaaS 场景），首次访问时才签发：

```caddy
{
    on_demand_tls {
        ask http://localhost:9090/allow
    }
}

*.customers.example.com {
    tls {
        on_demand
    }
}
```

`ask` 指向的接口返回 200 才允许签发，防止被滥用签发额度。

## 内网 IP 直接上 TLS

```caddy
https://192.168.1.100 {
    tls internal
    respond "internal"
}
```

浏览器照样会警告自签证书，但可以手工导入根证书消除警告。

## 禁用自动 HTTPS

```caddy
example.com {
    auto_https off
    respond "no tls"
}
```

或者全局层面关：

```caddy
{
    auto_https off
}

example.com:8080 {
    respond "plain http"
}
```

只对个别站点关闭 HTTPS：地址位写 `http://example.com` 或 `example.com:8080`。

## 全局 ACME 邮箱和重试

```caddy
{
    email admin@example.com
    acme_ca https://acme-v02.api.letsencrypt.org/directory
}
```

邮箱用于证书到期和安全告警。不设也能跑，但建议设——出问题时会收到通知。

## 排查证书问题

```bash
# 看证书链和有效期
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null \
  | openssl x509 -noout -dates -issuer -subject

# Caddy 的证书管理日志
sudo journalctl -u caddy -f | grep -i acme

# 看 Caddy 视角的存储内容
sudo caddy list-certificates
```

| 报错 | 原因 |
| --- | --- |
| `no such host` | DNS 没解析到本机，或解析到了 CDN |
| `connection refused`（验证时） | 80 端口被防火墙挡了，或被占用 |
| `too many certificates already issued` | 撞了 Let's Encrypt 每周 50 次的速率限制，等一周 |
| `NXDOMAIN` CAA | 域名有 CAA 记录没放行 CA |

:::tip[Cloudflare 用户注意]
橙色云朵模式下，HTTP-01 验证会失败（CF 不会把 80 端口透传给你的源站）。要么用 DNS-01，要么把验证用的那条 `/.well-known/acme-challenge/` 记录设成「仅 DNS」（灰云）。
:::
