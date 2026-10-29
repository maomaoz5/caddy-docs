---
title: 安装
description: 在 Linux、macOS、Windows 和 Docker 上安装 Caddy。
---

Caddy 是一个**静态编译**的 Go 程序，不依赖 glibc 版本、不需要运行时。这意味着下载、解压、运行，三步结束。

## Linux

推荐用官方仓库，可以自动跟版本：

```bash
# Ubuntu / Debian
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

不用仓库也行，直接下二进制：

```bash
curl -o caddy 'https://caddyserver.com/api/download?os=linux&arch=amd64'
sudo install caddy /usr/local/bin/caddy
```

:::caution[别只扔在/ 根目录]
有些教程让你 `cd / && wget caddy && chmod +x caddy`，然后靠 `caddy run` 裸跑。生产环境请老老实实装到 `PATH` 里并用 systemd 管理，否则重启后没人拉起进程。
:::

## macOS

```bash
brew install caddy
```

Homebrew 会顺便装好 `caddy.service`，需要常驻就跑：

```bash
brew services start caddy
```

## Windows

```powershell
winget install caddyserver.caddy
```

或者用 scoop：

```powershell
scoop bucket add main https://github.com/caddy-scoop/scoop-bucket
scoop install caddy
```

## Docker

```bash
docker run -d \
  -p 80:80 \
  -p 443:443 \
  -p 443:443/udp \
  -v /path/to/Caddyfile:/etc/caddy/Caddyfile:ro \
  -v caddy_data:/data \
  -v caddy_config:/config \
  caddy:2
```

三个挂载点各司其职：

| 挂载 | 用途 |
| --- | --- |
| `/etc/caddy` | 配置文件 |
| `/data` | **证书和密钥**，必须持久化，否则每次重建容器都要重新申请证书 |
| `/config` | 自动生成的运行时配置 |

:::danger[千万别漏掉 -v caddy_data:/data]
漏了它，你的容器每次重启都会重新跑一遍 ACME 签发流程，很容易撞上 Let's Encrypt 的速率限制，然后你就得对着 `429` 发呆了。
:::

## systemd 服务

包管理器安装会自动创建 `/etc/systemd/system/caddy.service`。手装的需要自己写：

```ini
[Unit]
Description=Caddy
After=network.target

[Service]
Type=notify
User=caddy
Group=caddy
ExecStart=/usr/local/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/bin/kill -USR1 $MAINPID
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now caddy
sudo systemctl reload caddy   # 改完配置后热加载
```

## 验证

```bash
caddy version
caddy list-modules | wc -l    # 模块数量，确认编译没被裁剪
sudo caddy validate --config /etc/caddy/Caddyfile
```

:::tip
`caddy validate` 应该在每次改配置后跑一遍。语法错误的 Caddyfile 在 `reload` 时才会炸，那时候线上已经受影响了。
:::