---
title: Go 集成
description: 把 Caddy 当库用，做嵌入式的 Web 服务器。
---

除了当独立进程，Caddy 也可以作为 Go 库嵌入到自己的程序里。

## 引入依赖

```bash
go get github.com/caddyserver/caddy/v2
```

## 最小示例

```go
package main

import (
	"log"

	"github.com/caddyserver/caddy/v2"
	_ "github.com/caddyserver/caddy/v2/modules/standard"
)

func main() {
	err := caddy.Run()
	if err != nil {
		log.Fatal(err)
	}
}
```

那个下划线导入 `modules/standard` 会注册所有标准模块——不导入的话，配置里用到的指令会报 `unknown directive`。

## 加载配置

```go
package main

import (
	"log"

	"github.com/caddyserver/caddy/v2"
	_ "github.com/caddyserver/caddy/v2/modules/standard"
)

func main() {
	err := caddy.Load("Caddyfile", true)
	if err != nil {
		log.Fatal(err)
	}

	// 阻塞
	select {}
}
```

第二个参数 `true` 表示强制只加载这个文件。

## 从字符串加载

```go
config := `
example.com {
    reverse_proxy localhost:3000
}
`

if err := caddy.LoadString(config, true); err != nil {
    log.Fatal(err)
}
```

## 自定义模块

Caddy 的模块系统基于 Go 的 `Module` 接口。最小实现：

```go
package mymodule

import (
	"github.com/caddyserver/caddy/v2"
	"github.com/caddyserver/caddy/v2/caddyconfig/caddyfile"
	"github.com/caddyserver/caddy/v2/caddyconfig/httpcaddyfile"
	"github.com/caddyserver/caddy/v2/core"
	"github.com/caddyserver/caddy/v2/modules/caddyhttp"
)

func init() {
	caddy.RegisterModule(GreetingHandler{})
	httpcaddyfile.RegisterHandlerDirective("greet", parseCaddyfile)
}

type GreetingHandler struct {
	Message string `json:"message,omitempty"`
}

func (GreetingHandler) CaddyModule() caddy.ModuleInfo {
	return caddy.ModuleInfo{
		ID:  "http.handlers.greet",
		New: func() caddy.Module { return new(GreetingHandler) },
	}
}

func (h *GreetingHandler) Provision(ctx caddy.Context) error {
	if h.Message == "" {
		h.Message = "Hello!"
	}
	return nil
}

func (h *GreetingHandler) ServeHTTP(
	w http.ResponseWriter, r *http.Request, next caddyhttp.Handler,
) error {
	w.Header().Set("Content-Type", "text/plain")
	w.Write([]byte(h.Message))
	return nil
}

func (h GreetingHandler) UnmarshalCaddyfile(d *caddyfile.Dispenser) error {
	d.Next() // 消费指令名
	if !d.NextArg() {
		return d.ArgErr()
	}
	h.Message = d.Val()
	return nil
}

var _ caddyhttp.MiddlewareHandler = (*GreetingHandler)(nil)
```

注册后就能在 Caddyfile 里用：

```caddy
example.com {
    greet "Welcome aboard"
}
```

## 启用 Go 模块

Caddyfile 里也能写 Go 代码块：

```caddy
example.com {
    respond "hi from Go"
}
```

或者显式：

```caddy
{
    order respond before reverse_proxy
}

example.com {
    respond {
        body "Hello from a handler"
        status 200
    }
}
```

## 动态改配置

```go
import "context"

handler, err := caddy.NewAdminHandler(context.Background(), caddy.String("caddyfile"))
if err != nil {
    log.Fatal(err)
}
err = handler.LoadConfig(`example.com { respond "changed" }`, true)
```

## 什么时候该用 Go 集成

| 场景 | 建议 |
| --- | --- |
| 独立部署 Web 服务器 | 用二进制，别嵌入 |
| 需要自定义处理逻辑 | 写模块 |
| 单测里起一个真实服务器 | 嵌入，很方便 |
| 桌面应用内嵌服务器 | 嵌入 |
| 想要热更新但不想管进程 | 子进程方式 |

:::tip
大部分「我想用 Go 写个反向代理」的需求，其实不需要嵌入 Caddy——直接用 `net/http/httputil.ReverseProxy` 几十行就够了。引入 Caddy 意味着扛上它整个依赖树，值得先掂量一下。
:::

## 构建带自定义模块的二进制

```go
//go:generate xcaddy build --with ./mymodule
```

或者命令行：

```bash
xcaddy build \
  --with github.com/caddy-dns/cloudflare \
  --with github.com/mholt/caddy-ratelimit \
  --with ./mymodule
```

产出的二进制是完全静态的，可以直接扔到任何 Linux 上跑。

## 单元测试

```go
func TestGreetingHandler(t *testing.T) {
	h := &GreetingHandler{Message: "hi"}
	if h.Message != "hi" {
		t.Fatal("unexpected message")
	}
}
```

对模块本身做单测，用 `caddytest` 集成测试框架：

```go
import "github.com/caddyserver/caddy/v2/caddytest"

func TestIntegration(t *testing.T) {
	tester := caddytest.NewTester(t)
	tester.InitServer(`
		localhost:9080 {
			greet "test"
		}
	`)
	tester.AssertGetResponse("http://localhost:9080/", 200, "test")
}
```