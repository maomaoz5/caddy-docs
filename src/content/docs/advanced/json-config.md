---
title: 构建 JSON 配置
description: 什么时候该绕开 Caddyfile，以及怎么做。
---

Caddyfile 是给人类写的 DSL。JSON 是给Caddy 真正执行的。当 DSL 不够用时，就切JSON。

## 什么时候需要

- 需要在路由里做动态计算（按权重、随机、条件表达式）
- 需要在运行时动态改配置
- 生成的配置结构复杂，Caddyfile 写出来比 JSON 还长
- 需要复用整段路由树

## 查看适配结果

```bash
caddy adapt --pretty --config Caddyfile
```

输出就是 Caddy 会加载的 JSON。先看这个有几个好处：

1. 确认 Caddyfile 的实际语义（有时候和你以为的不一样）
2. 找出哪些指令被重复/覆盖了
3. 学JSON 结构

输出顶部有 `"__warning"` 字段，里面是适配器给你的提醒，别忽略。

## 直接写 JSON

```bash
caddy run --config caddy.json
```

最小 JSON：

```json
{
  "apps": {
    "http": {
      "servers": {
        "srv0": {
          "listen": [":80"],
          "routes": [
            {
              "match": [{ "host": ["example.com"] }],
              "handle": [
                {
                  "handler": "static_response",
                  "body": "Hello, JSON!"
                }
              ],
              "terminal": true
            }
          ]
        }
      ]
    }
  }
}
```

## 结构速览

| 键 | 作用 |
| --- | --- |
| `apps` | 顶层应用：`http`、`tls`、`pki`、`admin` |
| `apps.http.servers` | 服务器列表，`listen` 是监听地址 |
| `routes` | 有序路由数组 |
| `handle` | 处理指令数组 |
| `match` | 匹配条件数组 |
| `terminal` | true 表示命中后不再往下走 |

## 对照：同一个反代的两种写法

**Caddyfile：**

```caddy
api.example.com {
    reverse_proxy localhost:8080
}
```

**JSON：**

```json
{
  "match": [{ "host": ["api.example.com"] }],
  "handle": [
    {
      "handler": "reverse_proxy",
      "upstreams": [{ "dial": "localhost:8080" }]
    }
  ],
  "terminal": true
}
```

可以看到 Caddyfile 那一行背后有多少东西被省略了——这就是它存在的意义。

## 两套配置共存

用一个 JSON 文件加载，再 import Caddyfile：

```json
{
  "apps": {
    "http": {
      "servers": {
        "srv0": {
          "listen": [":443"],
          "routes": [],
          "automatic_https": { "disable": true }
        }
      }
    },
    "admin": {}
  }
}
```

```bash
caddy run \
  --config base.json \
  --config Caddyfile
```

`--config` 可以传多次，后者会往前者合并。

## 从 Caddyfile 生成再改

实用工作流：

```bash
caddy adapt --pretty > base.json
# 编辑 base.json，加上 DSL 表达不了的部分
caddy run --config base.json
```

比从零手写 JSON 靠谱——反代、静态服务这些基础结构不用自己想。

:::caution[别把整个配置都改成 JSON]
Caddyfile 里的公共片段复用、命名匹配器这些能力，JSON 里都得靠生成代码来实现。除非你有自动生成配置的需求，否则 Caddyfile 更好维护。
:::

## 校验 JSON

```bash
caddy validate --config caddy.json
```

改完先validate 再 reload，和 Caddyfile 一样。

## 常见问题

| 报错 | 原因 |
| --- | --- |
| `route didn't match` | 路由顺序问题，靠前的 `terminal: true` 吃掉了请求 |
| `invalid JSON` | 多了尾逗号或注释（JSON 不支持注释） |
| `unknown field` | 字段名拼错，或版本不兼容 |
| `handler not registered` | 插件没编进二进制 |

:::tip[JSON 不支持注释]
手写 JSON 时想加注释，只能用 `//` 放在 `_comment` 之类的伪字段里，或者干脆保留一份 Caddyfile 作为源、用 `adapt` 生成 JSON。
:::