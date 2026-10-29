---
title: 命令行 CLI
description: caddy 命令的完整用法。
---

## 命令总览

```bash
caddy <子命令> [参数]
```

## 核心命令

| 命令 | 作用 | 常用参数 |
| --- | --- | --- |
| `run` | 启动并阻塞（systemd 用） | `--config` `--adapter` |
| `start` | 启动后后台运行 | 同上 |
| `reload` | 重载配置（零停机） | `--config` |
| `stop` | 停止服务 | |
| `restart` | 重启 | `--config` |
| `validate` | 校验配置 | `--config` |
| `adapt` | Caddyfile → JSON | `--pretty` `--validate` |
| `fmt` | 格式化 Caddyfile | `--overwrite` |
| `list-modules` | 列出已编译模块 | |
| `environ` | 打印环境变量 | |
| `version` | 版本信息 | |

## run 与 start 的区别

```bash
# run：前台阻塞，会发 sd_notify 给 systemd
caddy run --config /etc/caddy/Caddyfile

# start：后台运行
caddy start --config /etc/caddy/Caddyfile
```

systemd 里必须用 `run`，因为 systemd 需要追踪主进程、并通过 `sd_notify` 判断启动是否成功。用 `start` 的话 systemd 会认为进程立刻退出，触发反复重启。

## config 参数

```bash
# 指定配置文件（会同时尝试 Caddyfile 和 JSON）
caddy run --config /etc/caddy/Caddyfile

# 显式指定适配器
caddy adapt --config Caddyfile --adapter caddyfile

# 多个配置合并
caddy run --config base.json --config Caddyfile

# 从标准输入读
echo 'example.com { respond "hi" }' | caddy adapt --config - --adapter caddyfile
```

## adapt 常用组合

```bash
# 格式化输出
caddy adapt --pretty --config Caddyfile

# 顺便校验
caddy adapt --validate --pretty --config Caddyfile

# 只输出 stderr 里的警告
caddy adapt --config Caddyfile 2>&1 >/dev/null
```

输出里的 `__warning` 字段是适配器在告诉你「这里我做了妥协」，值得读一读。

## fmt

```bash
# 打印格式化结果
caddy fmt Caddyfile

# 直接改文件
caddy fmt --overwrite Caddyfile

# 检查是否需要格式化（CI 里用）
caddy fmt --diff Caddyfile
```

## 常用全局参数

```bash
--config, -c <path>       配置文件路径
--adapter, -a <name>      适配器名称
--pretty, -p              输出格式化
--validate                同时校验配置
--environ                 输出环境变量
```

## 开发常用

```bash
# 跑开发服务器，热重载
caddy run --config Caddyfile --watch

# 只打印将要加载的配置
caddy adapt --pretty > /tmp/caddy.json

# 反复 reload 测试配置（配合 watch）
caddy reload --watch --config Caddyfile
```

## 交互式 API

Caddy 启动后会在 `localhost:2019` 暴露 Admin API：

```bash
# 查看当前配置
curl localhost:2019/config/

# 触发重载
curl -X POST localhost:2019/load -H "Content-Type: application/json" \
  -d @config.json

# 优雅停机
curl -X POST localhost:2019/stop

# 查看指标（需开启 metrics）
curl localhost:2019/metrics
```

:::danger[别把 2019 暴露到公网]
Admin API 没有认证，任何人都能读配置、改配置、甚至停掉服务。默认只监听 localhost 是对的——如果要远程管理，走 SSH 隧道：

```bash
ssh -L 2019:localhost:2019 user@server
```
:::

## 退出码

| 码 | 含义 |
| --- | --- |
| 0 | 正常退出 |
| 1 | 通用错误 |
| 2 | CLI 用法错误 |
| 3 | 配置错误 |

CI 里可以用退出码判断：

```bash
if ! caddy validate --config Caddyfile; then
    echo "Caddyfile 有语法错误" >&2
    exit 1
fi
```

## 常见命令组合

```bash
# 部署前检查全套
caddy validate --config Caddyfile \
  && caddy fmt --diff Caddyfile \
  && sudo caddy reload --config Caddyfile

# 排查路由
caddy run --config Caddyfile --watch 2>&1 | grep -i 'match'

# 看模块列表
caddy list-modules | wc -l
caddy list-modules | grep tls
```

:::tip
`caddy fmt --diff` 特别适合放进 CI——它不改文件，只在格式不对时输出 diff 并返回非零。相当于给 Caddyfile 加了个 prettier 检查。
:::