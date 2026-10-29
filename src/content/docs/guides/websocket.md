---
title: WebSocket
description: Caddy 默认就支持，但有几个必须知道的坑。
---

## 好消息：不用配置

Caddy 能识别 WebSocket 握手请求并自动升级，**不需要任何特殊指令**：

```caddy
ws.example.com {
    reverse_proxy localhost:3000
}
```

握手、Upgrade 头、Connection 头、消息透传，全都自动处理。

## 需要注意的地方

### 1. 超时

WebSocket 是长连接，默认的空闲超时会把它掐掉：

```caddy
ws.example.com {
    reverse_proxy localhost:3000 {
        transport http {
            dial_timeout 10s
            response_header_timeout 0
            keepalive 30s
        }
    }
}
```

`response_header_timeout 0` 表示不限制——对长连接是必要的，否则握手慢一点就被判超时。

服务端也要配合：Node 的 `ws` / `socket.io` 要关掉心跳超时，Java 的 WebSocket 要调大 session timeout。

### 2. 中间的代理会掐断

如果 Caddy 前面还有一层（Cloudflare、Nginx、SLB），每一层都有自己的空闲超时，取**最短的那个**：

| 层| 默认空闲超时 |
| --- | --- |
| Cloudflare 代理模式 | 100 秒（有流量时自动续） |
| AWS ALB | 60 秒 |
| Nginx `proxy_read_timeout` | 60 秒 |
| Heroku Router | 55 秒 |

服务端每 30 秒发一个 ping 就能绕过所有这些限制。

### 3. Origin 检查

后端通常会校验 `Origin`，反代后这个头还在。Caddy 可以顺手规范化：

```caddy
ws.example.com {
    reverse_proxy localhost:3000 {
        header_up Origin {http.request.scheme}://{http.request.host}
    }
}
```

或者干脆在 Caddy 层限来源：

```caddy
ws.example.com {
    @bad not remote_ip 192.168.0.0/16
    respond @bad "Forbidden" 403
    reverse_proxy localhost:3000
}
```

### 4. 多实例时的会话粘性

socket.io 长轮询（fallback transport）会被负载均衡打散，导致「session id unknown」。两个解法：

**用粘性会话：**

```caddy
reverse_proxy localhost:3000 localhost:3001 {
    lb_policy cookie io 1h
}
```

**只升级 WebSocket（socket.io 会自动处理）：**

```caddy
@ws {
    header Connection *Upgrade*
    header Upgrade websocket
}
handle @ws {
    reverse_proxy localhost:3000
}
handle {
    reverse_proxy localhost:3001
}
```

## 验证

浏览器 DevTools → Network → WS：

- 状态码 **101 Switching Protocols** = 成功
- Frames 面板有持续消息 = 数据在流
- 30 秒后断开 = 某层超时了

命令行：

```bash
websocat -v wss://ws.example.com/socket
```

## 心跳示例

服务端（Node）：

```js
const wss = new WebSocketServer({ server, path: '/socket' });

// 每 25秒 ping 一次，低于常见的 60s 超时
setInterval(() => {
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.ping();
  });
}, 25_000);
```

:::tip
心跳间隔取**小于最短的那个超时**的一半左右。上面25 秒对应 60 秒的典型超时，留了足够余量。
:::

## 常见报错

| 报错 | 原因 |
| --- | --- |
| `Unexpected server response: 403` | Origin 校验失败 |
| `Connection closed` 固定 30/60 秒 | 空闲超时，配置 transport 超时 + 加心跳 |
| `1006 Abnormal Closure` | 网络层断开，看代理超时和负载均衡配置 |
| 握手成功但消息不通 | 后端路径和 Caddy 的 `handle_path` 剥掉的前缀不一致 |
| 多实例下「用户已断开」 | 没做会话粘性 |