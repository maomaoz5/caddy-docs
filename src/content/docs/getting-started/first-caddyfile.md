---
title: 第一个 Caddyfile
description: 从空文件到一个跑起来的站点，五分钟。
---

## 最小可用配置

建一个 `Caddyfile`：

```caddy
:8080 {
    respond "Hello, Caddy!"
}
```

启动：

```bash
caddy run --config Caddyfile
```

打开 `http://localhost:8080`，你就能看到那句话了。恭喜，你现在有一个 Web 服务器。

注意这里用的是 `:8080` 而不是域名——**没有域名就不会触发自动 HTTPS**。这是本地调试时特意保留的逃生舱。

## 换成真域名

有域名的话，只要把它写进地址位：

```caddy
example.com {
    respond "Hello from production!"
}
```

Caddy 会自动：

1. 解析该域名的 A/AAAA 记录，指向本机公网 IP；
2. 绑定 80/443 端口；
3. 通过 ACME 签发并**自动续期**证书；
4. 开启 HTTP → HTTPS 跳转；
5. 启用 HTTP/2，条件满足时还会启用 HTTP/3。

:::caution[前提条件]
域名必须已经解析到这台服务器，且 80 / 443 端口从公网可达。Cloudflare 代理模式下 443 需要放行；如果用橙色云朵，记得给 DNS 加上 CAA 记录允许 ZeroSSL 签发，否则会签发失败。
:::

## 反向代理

真实场景里最常见的一句：

```caddy
app.example.com {
    reverse_proxy localhost:3000
}
```

完事。`app.example.com` 的所有请求转发到本机 3000 端口，HTTPS 自动处理，WebSocket 自动升级。

## 静态站点

```caddy
example.com {
    root * /var/www/html
    file_server
}
```

`/var/www/html` 里放构建产物（`dist/`、`public/`、`.next/static` 之类）就完事了。

想支持单页应用（所有路径都回index.html）：

```caddy
example.com {
    root * /var/www/html
    try_files {path} /index.html
    file_server
}
```

## 配置文件放哪

| 场景 | 默认位置 |
| --- | --- |
| 包管理器安装 | `/etc/caddy/Caddyfile` |
| Docker | `/etc/caddy/Caddyfile`（自己挂） |
| 手搓二进制 | 自己定，习惯放 `/etc/caddy/` |

不指定路径时 Caddy 只会去找当前工作目录的 `./Caddyfile`——这个设计有人喜欢有人骂，因为 systemd 的工作目录通常不是 `/etc/caddy`。

## 常用命令

```bash
caddy start              # 前台跑（无守护，Ctrl-C 停止）
caddy run                # 阻塞运行，会发sd_notify 给 systemd
caddy reload             # 重新加载配置，零停机
caddy validate           # 只校验语法，不应用
caddy adapt              # Caddyfile → JSON，看看内部翻译成了什么
caddy fmt                # 格式化 Caddyfile，自动对齐
caddy version            # 版本 + 依赖模块
```

:::tip[caddy fmt 是被低估的功能]
Caddyfile 是**对空格敏感的**——用Tab 缩进会直接报错。`caddy fmt --overwrite Caddyfile` 可以一键修复格式和缩进对不齐的问题，省掉一半的手抖事故。
:::

## 下一步

配置本身只有几行，但背后的路由模型值得搞清楚：[配置结构](/concepts/structure/)讲的是站点块如何变成 JSON 路由。