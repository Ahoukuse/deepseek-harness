# @deepseek-ai/dsh-wsl-local

English | [中文](README.zh.md)

WSL Service Provider for the `@deepseek-ai/dsh-shell` executor seam over the [`@deepseek-ai/dsh-subprocess`](../../subprocess/subprocess/README.md) service, for Windows hosts that want the genuine bash dialect without a Windows bash shim: `WslBashExecutor` spawns `wsl.exe [--distribution <name>] --cd <workdir> --exec bash -c <command>` per call as a managed process through `ctx.subprocess`, so every command runs inside the host's installed WSL distribution. The executor owns everything WSL-shaped — launcher resolution, working-directory mapping across the Windows→Linux boundary, `WSLENV` environment forwarding, command defaulting and caps, timeout/cancel classification, the model-friendly terminal environment, and the model-facing stdout/stderr merge for background reads. Group mechanics (bounded spill-backed output, credential scrub, kill escalation, disposal) are the subprocess service's.

The command string rides as ONE argv element after `--exec bash -c`: the launcher hands it to bash verbatim without an intermediate Windows shell, so the string domain is exactly `bash -c` — the same dialect `dsh-bash-local` teaches, which is why the model-facing pairing is the unchanged [`dsh-tool-bash`](../tool-bash/README.md).

The package root exports the default and named `WslBashExecutor` plugin, its `Config`, the pure `resolveWslPath`/`candidateWslPaths`/`composeWslenv`/`isWindowsPath` helpers, and the `ENV_OVERRIDES`/`LAUNCHER_ENV` constants the executor injects into every spawn.

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

## Behavior

The WSL counterpart of `dsh-bash-local`, deliberately mirroring its semantics call-for-call:

- **Spawn per call, no shell state** — every call is a fresh `wsl.exe --exec bash -c` (deterministic; no login shell, no profile files, no reuse of an interactive WSL session).
- **Working directories cross the boundary through `--cd`** — the flag accepts BOTH dialects: a Windows path (`E:\repo`) runs under its drvfs mount (`/mnt/e/repo`), and a `/`-leading path is a Linux path inside the distribution. A Windows-dialect workdir doubles as the Windows-side spawn cwd (so a non-existent one fails the spawn, matching the local executors); a Linux-dialect workdir is meaningful only to `--cd`, and the Windows-side cwd falls back to the harness process's.
- **Environment crosses the boundary through `WSLENV`** — Windows environment entries do not reach Linux processes by themselves; the executor lists every name it stamps (the terminal overrides, the caller's env, the managed `DSH_*` snapshot) in a composed `WSLENV`, preserving an existing caller/ambient `WSLENV` as the prefix so its own forwarding rules survive. Values cross verbatim (flagless entries); path-translation flags are the caller's to include in their own `WSLENV` entry.
- **Launcher diagnostics pinned to UTF-8** — every spawn sets `WSL_UTF8=1`: without it the launcher writes its OWN messages (for example an unknown-distribution error) as UTF-16LE, which the subprocess collector's UTF-8 decode garbles. The Linux command's output is relayed as raw bytes and is unaffected either way.
- **The composition entry is a layer, not the last word** — when a settings provider is composed, this executor registers the capability's [`shell` namespace](../shell/README.md) with the entry above as its base, so a user section in `settings.yaml` layers over it and the next command runs with the new budgets. The namespace is shared with the other executor families because a host composes exactly one provider of `ctx.shell`. Values the schema cannot judge (positive and finite, the `graceMs` timer bound) are refused at the write; a stored `wslPath` re-probes the launcher only when it actually changed.
- **Launcher resolution** — `resolveWslPath` prefers an explicit `wslPath`, then on Windows probes the System32 launcher and every PATH entry (surrounding quotes stripped), checking each candidate with an lstat probe that accepts a real file or a link-shaped reparse point; elsewhere it falls back to a bare `wsl.exe` resolved through PATH. Resolution is a pure function of `(configured, env, platform)`.
- **Configured budgets over managed groups** — `resolve()` fills `workdir`/`timeoutMs`/`stdoutMaxBytes` from config, and every spawn hands the service explicit byte caps, spill cap, and `graceMs`. The grace must be positive, finite, and no greater than [`MAX_TIMER_DELAY_MS`](../../util/timeout/README.md). Tree termination (taskkill on the Windows side), the post-exit pipe-drain grace, tail-keep truncation, and bounded spill files are [`dsh-subprocess-local`](../../subprocess/subprocess-local/README.md) mechanics.
- **Timeout and cancel classification** — `run()` fuses its config-clamped timeout with the caller's signal through one deadline; only the executor's own timeout reports `timedOut`, an upstream cancel reports `aborted`, and a self-terminated command reports neither. A Linux-side signal death reaches Windows as the relay's exit code (the bare signal number or 128+N depending on the WSL release), never as a Windows-side `signal` fact.
- **Model-friendly terminal env** — `NO_COLOR=1 TERM=dumb PAGER=cat GIT_PAGER=cat` (the same set as `dsh-bash-local`; these are Linux-side facts, forwarded through the composed `WSLENV`) merged as ordinary env under the service's credential scrub and `DSH_*` channel rules; an explicit caller entry still wins.
- **Background processes** — `start()` returns a live `ShellProcess` handle immediately, no timeout applies, and the handle's `readOutput()` merges the service's offset-based stdout/stderr reads into one marked-section delta with a consuming cursor. A still-running process belongs to the subprocess service, so it survives executor reloads and dies (killed and joined) with the service's disposal.

## Model Experience

Indirectly, through the unchanged [`dsh-tool-bash`](../tool-bash/README.md): the tool teaches the bash dialect this executor genuinely runs, and renders its bounded stdout/stderr tails, background-process deltas (through the generic job runtime), spill-file paths, and infrastructure failures.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **Requires an installed WSL distribution** — a host whose `wsl.exe` exists but has no distribution fails every command with the launcher's diagnostic; the executor does not probe at load.
- **Unconfined** — commands run with the WSL default user's full authority inside the distribution AND with drvfs access to Windows drives; no `ctx.sandbox` integration exists for this executor (the [Windows ACL sandbox](../../sandbox/sandbox-windows-acl/README.md) confines the pwsh stack, not WSL). Compositions that hard-require `ctx.shell.sandboxMode` (permission presets) cannot mount over it.
- **Termination reaches the relay, not certainly the distribution** — `kill()` and disposal terminate the Windows-side `wsl.exe` tree; the stdio hangup takes the foreground Linux command with it, but a Linux process that daemonizes away from its pipes can outlive the relay inside the distribution.
- **A non-existent Linux-dialect workdir does not fail the launch** — `--cd` with a missing Linux directory silently falls back (observed: `/`) and the command still runs; a Windows-dialect workdir keeps local-executor semantics (spawn failure).
- **Windows termination reports no signal** — a force-killed relay settles as a nonzero exit with `signal: null`; `kill()`-initiated stops still stamp `killed` directly.
- **First command after WSL idle-shutdown pays the VM start** — WSL2 stops its utility VM after idle; the next spawn absorbs the cold-start latency (typically hundreds of milliseconds to seconds).
- **No persistent shell or PTY** — every call starts a fresh `bash -c`.
- **A background spawn-failure note is single-delivery** — the subprocess service buffers no output for a process that never ran, so the executor injects `spawn failed: …` into exactly one `readOutput()` delta.

Scrub-heuristic and spill-retention caveats live with [`dsh-subprocess-local`](../../subprocess/subprocess-local/README.md), which owns those mechanics.
