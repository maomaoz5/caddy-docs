---
title: 处理指令
description: handle、route、handle_path 到底怎么选。
---

这三个是配置里最常打架的三兄弟。搞清楚区别，配置就不乱了。

## handle

声明一个**互斥分支**。Caddy 按书写顺序逐个试，第一个匹配的分支执行完就结束——后面的分支不再看。

```caddy
example.com {
    handle /api/* {
        reverse_proxy localhost:8080
    }
    handle {
        root * /var/www
        file_server
    }
}
```

带 `/api/` 开头 → 走 8080，其余 → 静态文件。

## handle_path

`handle` 的语法糖，额外做了路径前缀剥离：

```caddy
# 这两段等价
handle_path /api/* {
    reverse_proxy localhost:8080
}

handle /api/* {
    uri strip_prefix /api
    reverse_proxy localhost:8080
}
```

所以请求 `/api/users` 转发出去变成 `/users`，后端不需要知道 Caddy 的存在。

:::caution[顺序很重要]
`handle_path /api/*` 必须写在前面。放后面的话通配的 `handle` 会先把请求吃掉，API 请求就永远落到静态文件了。
:::

## route

**不是**分支，是有序执行的指令列表。全部按顺序跑，谁先终结请求后面就不执行了。

```caddy
example.com {
    route {
        # 1. 明确 404 的 API 请求
        @notfound expression {path}.matches("^/api/") && {http.error.status_code} == 404
        handle_response @notfound {
            respond "API not found" 404
        }

        # 2. 主反代
        reverse_proxy localhost:3000

        # 3. 兜底（前面的都没终结请求才会到这里）
        file_server
    }
}
```

`route` 块内的指令是真正按代码顺序执行的，所以你可以写出「处理响应」这种依赖执行时机的逻辑——这是 `handle` 做不到的。

## handle_response

只在上游反代返回特定响应码时触发。处理上游 502 很实用：

```caddy
reverse_proxy localhost:3000 {
    @error status 502 503 504
    handle_response @error {
        respond "服务暂时不可用" 503
    }
}
```

它属于「处理指令」而非「路由指令」，写在 `reverse_proxy` 的块里。

## 选型速查

| 需求 | 用 |
| --- | --- |
| 按路径/主机分流 | `handle` + 匹配器 |
| 分流并剥掉前缀 | `handle_path` |
| 精细控制执行顺序 | `route` |
| 处理上游错误响应 | `handle_response` |
| 只想重写路径 | `rewrite` / `uri` |

## 常见错误

```caddy
# ✗ 错：通配分支先写，吃掉了所有请求
example.com {
    handle {
        root * /var/www
        file_server
    }
    handle_path /api/* {
        reverse_proxy localhost:8080
    }
}
```

修法：具体分支永远写前面。

```caddy
# ✓ 对
example.com {
    handle_path /api/* {
        reverse_proxy localhost:8080
    }
    handle {
        root * /var/www
        file_server
    }
}
```

:::tip[一个能验证的方法]
把候选顺序换一下，然后`caddy reload`。如果行为变了，说明你在写互斥分支——那就必须按「具体优先」排序。如果行为不变，说明是 `route`，顺序确实在控制执行流。
:::