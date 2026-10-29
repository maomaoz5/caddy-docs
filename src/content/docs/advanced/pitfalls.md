---
title: 常见坑
description: 那些文档没写、但你一定会撞上的问题。
---

## 用 Tab 缩进 Caddyfile

```
example.com {
	respond "hi"
}
```

Caddyfile **对空格敏感**。报错：

```
Error: adapting config using caddyfile: parsing caddyfile tokens for 'example.com': tokenization error: line 2: token is not a valid token

Error: Caddyfile:2 (parse error...): unrecognized token: '
```

修法：

```bash
caddy fmt --overwrite Caddyfile
```

---

## Docker 里连 localhost

```caddy
reverse_proxy localhost:3000   # ✗
```

容器里的 `localhost` 是容器自己。连宿主机要用：

```caddy
reverse_proxy host.docker.internal:3000
```

或直接用服务名（同一网络下）：

```caddy
reverse_proxy app:3000
```

---

## Docker volume 忘了挂/data

容器每次重建都重新申请证书，很容易撞上 Let's Encrypt 每周 50 次的限额，然后开始收获一串 `429`。

```bash
docker run -v caddy_data:/data -v caddy_config:/config ...
```

---

## 上游只监听 127.0.0.1 导致 502

应用绑在 `127.0.0.1:3000`，Caddy 在另一个网络命名空间，连不上。

改成监听 `0.0.0.0`，然后用防火墙挡住外部访问：

```bash
sudo ufw allow from 172.17.0.0/16 to any port 3000
```

---

## 指令顺序导致规则失效

```caddy
example.com {
    respond "hi"          # 先终结了请求
    reverse_proxy localhost:3000   # 永远执行不到
}
```

用 `route` 显式排序：

```caddy
example.com {
    route {
        reverse_proxy localhost:3000
        respond "hi"
    }
}
```

---

## handle块顺序反了

```caddy
example.com {
    handle {                    # 通配块在前，吃掉所有请求
        root * /var/www
        file_server
    }
    handle /api/* {             # 永远不会被匹配
        reverse_proxy localhost:8080
    }
}
```

**具体永远在前。**

---

## 重载后配置没变

`caddy reload` 读的是默认路径 `/etc/caddy/Caddyfile`，而你改的是当前目录的文件。

```bash
sudo caddy reload --config /etc/caddy/Caddyfile
# 或
caddy reload --config ./Caddyfile --adapter caddyfile
```

---

## 证书申请失败

| 报错 | 解法 |
| --- | --- |
| `no such host` | DNS 没指过来，或指到 CDN 了 |
| `connection refused` | 80 端口不通 |
| `too many certificates` | 撞速率限制，等 |
| `NXDOMAIN` CAA | 加 CAA 记录或删掉现有的 |

查看 ACME 日志：

```bash
sudo journalctl -u caddy -f | grep -i acme
```

---

## Cloudflare 下申请不到证书

橙色云朵会阻断 HTTP-01 验证。两个方案：

1. DNS-01（推荐，也支持通配符）：
   ```caddy
   tls {
       dns cloudflare {env.CF_API_TOKEN}
   }
   ```
2. 给 `/.well-known/acme-challenge/` 加一条灰云 DNS 记录

---

## 环境变量改了不生效

`reload` 不会重读环境变量，必须 `restart`：

```bash
sudo systemctl restart caddy
```

---

## 301 循环

上游返回了 `http://` 的 Location，但 Caddy 对外强制 https。改上游配置，或者在 Caddy 层重写：

```caddy
reverse_proxy localhost:3000 {
    header_down Location "https://{http.request.host}{uri}"
}
```

---

## 静态文件 404

路径不对是最常见的。确认：

```bash
ls -la /var/www/html/index.html
```

还有权限：Caddy 的 systemd 服务以 `caddy` 用户运行，读不到就是 403。

```bash
sudo -u caddy ls /var/www/html
```

---

## 上传大文件 413

三层限制都可能拦：

```bash
# Caddy 层
request_body {
    max_size 100MB
}
```

```nginx
# 前面如果有 Nginx
client_max_body_size 100m;
```

```nginx
# 上游应用自己（以 nginx 为例）
client_max_body_size 100m;
```

---

## WebSocket 定时断开

某层代理的空闲超时（通常是 60 秒）。两个都要做：

```caddy
reverse_proxy localhost:3000 {
    transport http {
        response_header_timeout 0
    }
}
```

```js
setInterval(() => client.ping(), 25_000);  // 服务端心跳
```

---

## 日志把磁盘写满

同时检查两处：

```bash
df -h              # 空间
df -i              # inode —— 小文件多了会先耗尽 inode
sudo du -sh /var/log/caddy
```

---

## reload 失败但配置已改

`reload` 是「加载新配置 → 原子切换」。如果新配置语法错误，旧配置继续跑——这是好事，但也意味着你以为改上了其实没改上。

所以：先 validate。

```bash
sudo caddy validate --config /etc/caddy/Caddyfile && sudo caddy reload
```

---

## 不知道路由为什么没命中

```caddy
example.com {
    debug
}
```

它会把每个请求的路由匹配过程打到 stderr。看到 `no match` 就知道是没匹配上，而不是请求根本没到这台机器。

---

## find哪里最容易出错

按被踩频率排：

1. **指令/handle 顺序** → 规则写了但没生效
2. **Docker 网络** → localhost 指向错了地方
3. **环境变量不重读** → 改了值没变化
4. **权限** → 静态文件 403，证书目录读不到
5. **中间代理超时** → 连接莫名断开

:::tip
遇到诡异问题，先开 `debug`，再看 `caddy adapt --pretty` 的输出确认语义。80% 的「Caddy 有bug」最后都是配置理解偏差。
:::