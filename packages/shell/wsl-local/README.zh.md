# @deepseek-ai/dsh-wsl-local

[English](README.md) | 中文

`@deepseek-ai/dsh-shell` 执行器 seam 的 WSL Service Provider，基于 [`@deepseek-ai/dsh-subprocess`](../../subprocess/subprocess/README.zh.md) 服务，面向希望获得真正 bash 方言而无需 Windows bash 垫片的 Windows 主机：`WslBashExecutor` 每次调用以 `wsl.exe [--distribution <name>] --cd <workdir> --exec bash -c <command>` 形式通过 `ctx.subprocess` 生成受管进程，因此每条命令都在主机已安装的 WSL 发行版内运行。执行器负责一切 WSL 相关事务——启动器解析、跨 Windows→Linux 边界的工作目录映射、`WSLENV` 环境转发、命令默认值与上限、超时/取消归类、模型友好的终端环境，以及后台读取所用的面向模型 stdout/stderr 合并。组管理机制（有界溢写输出、凭据擦除、终止升级、清理）归 subprocess 服务所有。

命令字符串作为 `--exec bash -c` 之后的单个 argv 元素传递：启动器将其原样交给 bash，中间没有 Windows shell 层，因此字符串域正是 `bash -c`——与 `dsh-bash-local` 教给模型的方言完全一致，这也是面向模型的配对工具直接沿用 [`dsh-tool-bash`](../tool-bash/README.zh.md) 的原因。

包根导出默认与具名的 `WslBashExecutor` 插件、其 `Config`、纯函数 `resolveWslPath`/`candidateWslPaths`/`composeWslenv`/`isWindowsPath`，以及执行器注入每次 spawn 的 `ENV_OVERRIDES`/`LAUNCHER_ENV` 常量。

## Config

```yaml
- id: bash
  name: '@deepseek-ai/dsh-wsl-local'
  config:
    cwd: E:\path\to\workspace   # default: process.cwd(); either path dialect (E:\repo or /home/me/repo)
    timeoutMs: 120000           # default foreground timeout
    maxTimeoutMs: 600000        # cap for per-call overrides
    maxOutputBytes: 64000       # per-stream in-memory cap; overflow spills to disk
    maxSpillBytes: 67108864     # per-stream full-output spill cap
    graceMs: 3000               # kill escalation and post-exit pipe-drain grace
    wslPath: C:\Windows\System32\wsl.exe  # explicit launcher; else System32, then PATH
    distribution: Ubuntu        # wsl --distribution; else the host's default distribution
```

## 行为

`dsh-bash-local` 的 WSL 对应物，刻意逐调用镜像其语义：

- **每次调用新建进程，无 shell 状态**——每次调用都是全新的 `wsl.exe --exec bash -c`（确定性；无登录 shell、无 profile 文件、不复用交互式 WSL 会话）。
- **工作目录经 `--cd` 跨越边界**——该标志接受两种方言：Windows 路径（`E:\repo`）在其 drvfs 挂载（`/mnt/e/repo`）下运行，`/` 开头的路径是发行版内的 Linux 路径。Windows 方言的 workdir 同时充当 Windows 侧 spawn cwd（因此不存在的目录会导致 spawn 失败，与本地执行器一致）；Linux 方言的 workdir 只对 `--cd` 有意义，Windows 侧 cwd 回退为宿主进程自身的。
- **环境经 `WSLENV` 跨越边界**——Windows 环境项不会自行到达 Linux 进程；执行器把它注入的每个名字（终端覆盖项、调用方 env、托管 `DSH_*` 快照）列入合成的 `WSLENV`，并保留调用方/环境已有的 `WSLENV` 作为前缀，使其自身的转发规则得以延续。值原样跨越（无标志条目）；路径转换标志由调用方在自己的 `WSLENV` 条目中给出。
- **启动器诊断钉在 UTF-8**——每次 spawn 设置 `WSL_UTF8=1`：否则启动器以 UTF-16LE 写出它自己的消息（例如未知发行版错误），会被 subprocess 收集器的 UTF-8 解码弄乱。Linux 命令的输出按原始字节中继，两种情况下都不受影响。
- **组合条目是一层，不是终点**——组合了 settings provider 时，本执行器以上述条目为基础注册该能力的 [`shell` 命名空间](../shell/README.zh.md)，`settings.yaml` 中的用户段叠加其上，下一条命令即以新预算运行。命名空间与其他执行器家族共享，因为一台主机恰好组合一个 `ctx.shell` 提供方。schema 无法判断的值（正且有限、`graceMs` 计时器上界）在写入处被拒绝；存储的 `wslPath` 仅在实际变化时重新探测启动器。
- **启动器解析**——`resolveWslPath` 优先采用显式 `wslPath`，然后在 Windows 上依次探测 System32 启动器与每个 PATH 条目（剥去两侧引号），用 lstat 探针检查每个候选（接受真实文件或链接形态的 reparse point）；其他平台回退为经 PATH 解析的裸 `wsl.exe`。解析是 `(configured, env, platform)` 的纯函数。
- **配置预算叠加受管进程组**——`resolve()` 从配置填充 `workdir`/`timeoutMs`/`stdoutMaxBytes`，每次 spawn 向服务显式传递字节上限、溢写上限与 `graceMs`。宽限必须为正、有限且不大于 [`MAX_TIMER_DELAY_MS`](../../util/timeout/README.zh.md)。进程树终止（Windows 侧 taskkill）、退出后管道排空宽限、保尾截断与有界溢写文件是 [`dsh-subprocess-local`](../../subprocess/subprocess-local/README.zh.md) 的机制。
- **超时与取消归类**——`run()` 用单一 deadline 融合配置钳制的超时与调用方信号；只有执行器自身的超时报告 `timedOut`，上游取消报告 `aborted`，自我终止的命令两者皆否。Linux 侧的信号死亡以中继的退出码到达 Windows（裸信号值或 128+N，取决于 WSL 版本），绝不会成为 Windows 侧的 `signal` 事实。
- **模型友好的终端环境**——`NO_COLOR=1 TERM=dumb PAGER=cat GIT_PAGER=cat`（与 `dsh-bash-local` 同一集合；这些是 Linux 侧事实，经合成的 `WSLENV` 转发），作为普通 env 在服务的凭据擦除与 `DSH_*` 通道规则下合并；调用方的显式条目仍然胜出。
- **后台进程**——`start()` 立即返回活的 `ShellProcess` 句柄，不适用超时，句柄的 `readOutput()` 用消费型游标把服务的偏移式 stdout/stderr 读取合并为带标记分节的单一增量。仍在运行的进程属于 subprocess 服务，因此它跨执行器重载存活，并随服务清理（终止并汇合）而结束。

## 模型体验

间接的，经由原封不动的 [`dsh-tool-bash`](../tool-bash/README.zh.md)：该工具教授的 bash 方言正是本执行器真实运行的方言，并渲染其有界 stdout/stderr 尾部、后台进程增量（经通用任务运行时）、溢写文件路径与基础设施失败。

#### KV Cache 影响

无直接失效；具名 Consumer 负责任何请求前缀变化。

## 已知限制与暂缓工作

- **要求已安装的 WSL 发行版**——`wsl.exe` 存在但没有发行版的主机上每条命令都以启动器诊断失败；执行器不在加载时探测。
- **不受限**——命令以 WSL 默认用户在发行版内的完整权限运行，并经 drvfs 访问 Windows 磁盘；本执行器没有 `ctx.sandbox` 集成（[Windows ACL 沙箱](../../sandbox/sandbox-windows-acl/README.zh.md)限制的是 pwsh 栈，不是 WSL）。硬性要求 `ctx.shell.sandboxMode` 的组合（permission presets）无法挂载在其上。
- **终止到达中继，不保证到达发行版**——`kill()` 与清理终止 Windows 侧的 `wsl.exe` 树；stdio 挂断会带走前台 Linux 命令，但脱离其管道守护化的 Linux 进程可能在发行版内活过中继。
- **不存在的 Linux 方言 workdir 不会使启动失败**——`--cd` 遇到缺失的 Linux 目录会静默回退（观测为 `/`）且命令照常运行；Windows 方言的 workdir 保持本地执行器语义（spawn 失败）。
- **Windows 终止不报告信号**——被强制终止的中继以非零退出码和 `signal: null` 落定；`kill()` 发起的停止仍直接盖 `killed` 戳。
- **WSL 空闲停机后的首条命令承担 VM 启动**——WSL2 在空闲后停止其 utility VM；下一次 spawn 吸收冷启动延迟（通常数百毫秒到数秒）。
- **无持久 shell 或 PTY**——每次调用都启动全新的 `bash -c`。
- **后台 spawn 失败提示单次投递**——subprocess 服务不为从未运行的进程缓冲输出，因此执行器把 `spawn failed: …` 注入恰好一次 `readOutput()` 增量。

擦除启发式与溢写保留的注意事项归 [`dsh-subprocess-local`](../../subprocess/subprocess-local/README.zh.md)，它拥有这些机制。
