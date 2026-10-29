---
title: 配置结构
description: Caddyfile 如何被解析成 JSON 路由。
---

Caddy 内部只认JSON。但你写Caddyfile。中间那个翻译器叫 **adapter**，`caddy adapt` 命令就是把它单独拎出来给你看。

## 三层结构

```caddy
example.com {          # 1. 站点块
    @api path/api/*     # 2. 具名匹配器
    handle @api {              # 3. 处理指令块
        reverse_proxy api:8080
    }
    handle {
        root * /var/www
        file_server
    }
}
```

1. **站点块（site block）**：地址 + 一组指令。可以嵌套，但只有一层有意义。
2. **具名匹配器（named matcher）**：`@名字 条件`，定义一个可复用的请求筛选器。
3. **处理指令块（handler block）**：`handle` / `route` / `handle_path`，控制指令的执行顺序。

## 关键概念：顺序与顺序无关

这是最容易踩坑的地方。

Caddyfile 里**每条指令只会被适配一次**。像 `respond` 这种会「终结请求」的指令，如果排在 `reverse_proxy` 后面，它就永远不会执行——因为请求早就被反代走了。

所以有两条路：

**方式一：靠调整顺序解决**

```caddy
example.com {
    root * /var/www
    file_server
    reverse_proxy localhost:9000   # 永远不会执行
}
```

**方式二：用 `route` 显式排序（推荐）**

```caddy
example.com {
    route {
        reverse_proxy localhost:9000
        file_server
    }
}
```

:::tip[记忆法]
`handle` 块之间是**互斥**的，按书写顺序第一个匹配的赢；`route` 块里的指令是**普通的连续代码**，谁先执行谁的顺序敏感。拿不准就用 `route`。
:::

## handle vs handle_path

```caddy
@api path /api/*
handle @api {
    uri strip_prefix /api          # 把 /api/foo 变成 /foo
    reverse_proxy localhost:8080
}
handle {
    reverse_proxy localhost:3000
}
```

| 指令 | 作用 |
| --- | --- |
| `handle` | 声明一个互斥的处理分支，块内指令重排序 |
| `handle_path` | 同 `handle`，但自动剥离匹配到的路径前缀 |
| `route` | 声明一组有序指令，块内保持书写顺序 |

`handle_path /api/* { reverse_proxy localhost:8080 }` 等价于 `handle` + `uri strip_prefix`，一行搞定。

## 一个地址可以写多个

```caddy
example.com, www.example.com {
    respond "both"
}
```

## 通配与子域名

```caddy
*.example.com {
    reverse_proxy localhost:9000
}
```

这是**通配符**匹配，不含`example.com` 本身。另外它默认不申请证书（通配符证书贵），要显式开：

```caddy
*.example.com {
    tls {
        dns cloudflare {env.CF_API_TOKEN}
    }
    reverse_proxy localhost:9000
}
```

## 站点块优先级

多个站点块地址重叠时，Caddy 按这个顺序挑最具体的：

1. 完全匹配的域名
2. 通配符（最长优先，比如 `*.api.example.com` 优先于 `*.example.com`）
3. 独立的 HTTP/HTTPS 端口

:::caution
地址冲突时Caddy 会在启动时报 `ambiguous site definition`。别靠猜，加个`import` 把公共部分抽出来复用更省事。
:::

## 环境变量与占位符

```caddy
api.example.com {
    reverse_proxy {$API_BACKEND:localhost:8080}
}
```

`{$名字:默认值}` 是环境变量占位符，冒号后是默认值。也可以在文件顶部统一声明：

```caddy
{$API_BACKEND} localhost:8080
```

## 复用：import

Caddy 没有变量，但有 `import`：

```caddy
(common) {
    encode gzip zstd
    header {
        X-Frame-Options SAMEORIGIN
    }
}

example.com {
    import common
    reverse_proxy localhost:3000
}

api.example.com {
    import common
    reverse_proxy localhost:8080
}
```

括号开头的段落是**片段（snippet）**，只在被 import 时才生效，不会变成独立站点块。