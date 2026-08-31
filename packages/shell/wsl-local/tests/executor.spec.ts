/**
 * Real-process tests for `@deepseek-ai/dsh-wsl-local`: the LOCAL subprocess
 * service plus a REAL `wsl.exe` launcher, exercised through the executor seam
 * (`resolve` → `run`/`start`). These verify the world — actual bash runs
 * inside the installed distribution, working-directory mapping across the
 * Windows→Linux boundary, `WSLENV` environment forwarding, output capture,
 * truncation and spill, deadlines, kill escalation, and the background-handle
 * contract. The suite self-skips when no usable WSL resolves (a CI
 * accommodation for hosts without WSL); the pure unit tests (config
 * validation, launcher resolution, spawn construction) run on every platform.
 */

import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  WslBashExecutor,
  ENV_OVERRIDES,
  LAUNCHER_ENV,
  candidateWslPaths,
  composeWslenv,
  isWindowsPath,
  resolveWslPath,
} from '@deepseek-ai/dsh-wsl-local'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import SubprocessRuntime from '@deepseek-ai/dsh-subprocess'
import type { SubprocessHandle, SubprocessOutputReader, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import type { ShellProcess } from '@deepseek-ai/dsh-shell'

const spillDir = mkdtempSync(join(tmpdir(), 'dsh-wsl-exec-spec-'))

// The probe follows the executor's own resolution AND its bash invocation, so
// it fails exactly when the real suites would (no launcher, or a launcher
// without an installed distribution).
const hasWsl = spawnSync(resolveWslPath(), ['--exec', 'bash', '-c', 'true'], { encoding: 'utf8' }).status === 0

/** Normalize launcher-written CRLF; the Linux side always writes LF. */
const lf = (text: string): string => text.replace(/\r\n/g, '\n')

async function setup(config: ConstructorParameters<typeof WslBashExecutor>[1] = {}) {
  const ctx = new Context()
  await ctx.plugin(LocalSubprocessRuntime)
  ;(ctx.subprocess as LocalSubprocessRuntime).internals = { spillDir }
  // A short kill grace via the REAL config path, so escalation tests stay fast.
  await ctx.plugin(WslBashExecutor, { graceMs: 200, ...config })
  const bash = ctx.shell as WslBashExecutor
  return { ctx, bash }
}

/**
 * Poll a handle's consuming readOutput until the ACCUMULATED delta contains
 * `expected`; returns the accumulation (reads never re-deliver, so the caller
 * gets everything produced up to the match).
 */
async function readUntil(proc: ShellProcess, expected: string, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  let all = ''
  while (Date.now() < deadline) {
    all += proc.readOutput().delta
    if (lf(all).includes(expected)) return lf(all)
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`process output did not include ${JSON.stringify(expected)}; accumulated ${JSON.stringify(lf(all))}`)
}

describe('resolveWslPath and candidateWslPaths (pure, every platform)', () => {
  it('trusts an explicit configured path verbatim', () => {
    expect(resolveWslPath('C:\\custom\\wsl.exe')).toBe('C:\\custom\\wsl.exe')
    expect(resolveWslPath('wsl')).toBe('wsl')
  })

  it('falls through an empty configured path to platform resolution', () => {
    expect(resolveWslPath('', {
      PATH: 'P:\\no-tools',
      SystemRoot: 'S:\\no-windows',
    }, 'win32')).toBe('wsl.exe')
  })

  it('returns wsl.exe on non-Windows platforms regardless of the environment', () => {
    expect(resolveWslPath(undefined, { SystemRoot: 'S:\\Windows' }, 'linux')).toBe('wsl.exe')
    expect(resolveWslPath(undefined, { PATH: 'P:\\tools' }, 'darwin')).toBe('wsl.exe')
  })

  it('uses the stable Windows root when the environment omits SystemRoot', () => {
    expect(candidateWslPaths({})).toEqual([
      join('C:\\Windows', 'System32', 'wsl.exe'),
    ])
  })

  it('lists the System32 launcher, then PATH entries (quotes stripped)', () => {
    const candidates = candidateWslPaths({
      SystemRoot: 'S:\\Windows',
      PATH: ';"Q:\\quoted tools";' + ';',
    })
    expect(candidates).toEqual([
      join('S:\\Windows', 'System32', 'wsl.exe'),
      join('Q:\\quoted tools', 'wsl.exe'),
    ])
    // A missing PATH contributes no entries (the empty-string fallback).
    expect(candidateWslPaths({ SystemRoot: 'S:\\Windows' }))
      .toEqual([join('S:\\Windows', 'System32', 'wsl.exe')])
  })

  it('returns the first EXISTING win32 candidate, else wsl.exe', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-wsl-resolve-'))
    const tools = join(dir, 'tools')
    mkdirSync(tools, { recursive: true })
    writeFileSync(join(tools, 'wsl.exe'), '')
    // The existing PATH entry wins over the non-existent System32 launcher.
    expect(resolveWslPath(undefined, { SystemRoot: join(dir, 'no-windows'), PATH: tools }, 'win32'))
      .toBe(join(tools, 'wsl.exe'))
    // No candidate exists anywhere → the PATH-resolution fallback.
    expect(resolveWslPath(undefined, { SystemRoot: join(dir, 'no-windows'), PATH: join(dir, 'empty') }, 'win32'))
      .toBe('wsl.exe')
  })

  it('accepts a link-shaped PATH candidate whose target cannot be stat-ed', () => {
    // Store app execution aliases stat as EACCES but lstat as a link; a
    // dangling symlink reproduces that split on every platform.
    const dir = mkdtempSync(join(tmpdir(), 'dsh-wsl-resolve-link-'))
    const tools = join(dir, 'tools')
    mkdirSync(tools, { recursive: true })
    const link = join(tools, 'wsl.exe')
    symlinkSync(join(dir, 'no-such-target.exe'), link)
    expect(resolveWslPath(undefined, { SystemRoot: join(dir, 'no-windows'), PATH: tools }, 'win32'))
      .toBe(link)
  })

  it('skips a directory candidate and falls through to the PATH-resolution default', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-wsl-resolve-dir-'))
    const tools = join(dir, 'tools')
    mkdirSync(join(tools, 'wsl.exe'), { recursive: true })
    expect(resolveWslPath(undefined, {
      SystemRoot: join(dir, 'no-windows'),
      PATH: tools,
    }, 'win32')).toBe('wsl.exe')
  })
})

describe('composeWslenv and isWindowsPath (pure, every platform)', () => {
  it('lists the terminal overrides plus caller env and dshEnv names', () => {
    const value = composeWslenv({ env: { SEAM_VAR: 'x' }, dshEnv: { DSH_SESSION_ID: 'y' } }, undefined)
    expect(value.split(':')).toEqual([...Object.keys(ENV_OVERRIDES), 'SEAM_VAR', 'DSH_SESSION_ID'])
  })

  it('keeps an ambient WSLENV as the prefix', () => {
    const value = composeWslenv({}, 'AMBIENT_VAR/p')
    expect(value.startsWith('AMBIENT_VAR/p:')).toBe(true)
    // An empty ambient value contributes no empty prefix segment.
    expect(composeWslenv({}, '').startsWith(':')).toBe(false)
  })

  it('lets a caller WSLENV entry replace the ambient base without listing itself', () => {
    const value = composeWslenv({ env: { WSLENV: 'CALLER_VAR', OTHER: 'x' } }, 'AMBIENT_VAR')
    expect(value.split(':')).toEqual(['CALLER_VAR', ...Object.keys(ENV_OVERRIDES), 'OTHER'])
  })

  it('classifies drive and UNC paths as Windows, slash-leading as Linux', () => {
    expect(isWindowsPath('C:\\repo')).toBe(true)
    expect(isWindowsPath('e:/repo')).toBe(true)
    expect(isWindowsPath('\\\\server\\share')).toBe(true)
    expect(isWindowsPath('/tmp')).toBe(false)
    expect(isWindowsPath('relative/dir')).toBe(false)
  })
})

describe('spawn construction (pure, every platform)', () => {
  /** A subprocess service that records spawn specs and settles instantly. */
  class CapturingSubprocessRuntime extends SubprocessRuntime {
    specs: SubprocessSpawnSpec[] = []
    override async resolveExecutable(command: string): Promise<string> { return command }
    override spawnTerminal(): Promise<never> { throw new Error('wsl spawns pipes, never terminals') }
    private readonly reader: SubprocessOutputReader = {
      readFrom: () => ({ text: '', lossy: false, nextOffset: 0 }),
    }
    override spawn(spec: SubprocessSpawnSpec): SubprocessHandle {
      this.specs.push(spec)
      return {
        pid: -1,
        stdin: undefined,
        stdout: undefined,
        stderr: undefined,
        collected: { stdout: this.reader, stderr: this.reader },
        done: Promise.resolve({ exitCode: 0, signal: null }),
        terminate: () => {},
        waitForExit: async () => true,
      }
    }
  }

  async function capture(config: ConstructorParameters<typeof WslBashExecutor>[1] = {}) {
    const ctx = new Context()
    const subprocess = new CapturingSubprocessRuntime(ctx)
    await ctx.plugin(WslBashExecutor, config)
    return { subprocess, bash: ctx.shell as WslBashExecutor }
  }

  it('runs every command as ONE argv element after --cd/--exec bash -c', async () => {
    const { subprocess, bash } = await capture()
    await bash.run(bash.resolve({ command: 'echo 你好', workdir: 'C:\\repo' }))
    expect(subprocess.specs).toHaveLength(1)
    const spec = subprocess.specs[0]!
    expect(spec.argv).toEqual([expect.any(String), '--cd', 'C:\\repo', '--exec', 'bash', '-c', 'echo 你好'])
    // A Windows-dialect workdir doubles as the Windows-side spawn cwd.
    expect(spec.cwd).toBe('C:\\repo')
  })

  it('inserts --distribution before --cd when configured', async () => {
    const { subprocess, bash } = await capture({ distribution: 'Ubuntu' })
    await bash.run(bash.resolve({ command: 'true', workdir: '/tmp' }))
    const spec = subprocess.specs[0]!
    expect(spec.argv.slice(1, 5)).toEqual(['--distribution', 'Ubuntu', '--cd', '/tmp'])
    // A Linux-dialect workdir cannot be the Windows-side cwd; --cd owns it.
    expect(spec.cwd).toBe(process.cwd())
  })

  it('stamps the launcher env, terminal overrides, and a composed WSLENV', async () => {
    const { subprocess, bash } = await capture()
    await bash.run(bash.resolve({ command: 'true', env: { SEAM_VAR: 'x' }, dshEnv: { DSH_SESSION_ID: 'y' } }))
    const env = subprocess.specs[0]!.env!
    expect(env).toMatchObject({ ...LAUNCHER_ENV, ...ENV_OVERRIDES, SEAM_VAR: 'x', DSH_SESSION_ID: 'y' })
    expect(env.WSLENV).toBe(composeWslenv({ env: { SEAM_VAR: 'x' }, dshEnv: { DSH_SESSION_ID: 'y' } }, process.env.WSLENV))
  })
})

describe.skipIf(!hasWsl)('WslBashExecutor.run', () => {
  it('resolves with output and the effective timeout', { timeout: 20_000 }, async () => {
    const { bash } = await setup({ timeoutMs: 15_000 })
    const result = await bash.run(bash.resolve({ command: 'echo hi' }))
    expect(result.exitCode).toBe(0)
    expect(lf(result.stdout.text)).toBe('hi\n')
    expect(result.timeoutMs).toBe(15_000)
  })

  it('maps a Windows workdir onto its drvfs mount, overridable per call', async () => {
    const first = mkdtempSync(join(tmpdir(), 'dsh-wsl-cwd-a-'))
    const second = mkdtempSync(join(tmpdir(), 'dsh-wsl-cwd-b-'))
    // Marker files prove the mapping without translating paths in the test.
    writeFileSync(join(first, 'marker.txt'), 'from-config\n')
    writeFileSync(join(second, 'marker.txt'), 'from-call\n')
    const { bash } = await setup({ cwd: first })
    const fromConfig = await bash.run(bash.resolve({ command: 'cat marker.txt' }))
    expect(lf(fromConfig.stdout.text)).toBe('from-config\n')
    const fromCall = await bash.run(bash.resolve({ command: 'cat marker.txt', workdir: second }))
    expect(lf(fromCall.stdout.text)).toBe('from-call\n')
  })

  it('accepts a Linux-dialect workdir', async () => {
    const { bash } = await setup()
    const result = await bash.run(bash.resolve({ command: 'pwd', workdir: '/tmp' }))
    expect(lf(result.stdout.text)).toBe('/tmp\n')
  })

  it('falls back inside the distribution when a Linux workdir does not exist', async () => {
    // `--cd` with a missing Linux directory does not fail the launch: WSL
    // silently falls back (observed: /) and the command still runs — the
    // caveat this package's README documents.
    const { bash } = await setup()
    const result = await bash.run(bash.resolve({ command: 'pwd', workdir: '/nonexistent-dsh' }))
    expect(result.exitCode).toBe(0)
    expect(lf(result.stdout.text)).not.toBe('/nonexistent-dsh\n')
  })

  it('rejects on spawn failure (non-existent Windows workdir)', async () => {
    const { bash } = await setup()
    const missing = join(tmpdir(), 'dsh-wsl-missing', 'sub')
    await expect(bash.run(bash.resolve({ command: 'true', workdir: missing }))).rejects.toThrow(/ENOENT/)
  })

  it('reports an unknown distribution as a decodable command failure', async () => {
    const { bash } = await setup({ distribution: 'dsh-no-such-distro' })
    const result = await bash.run(bash.resolve({ command: 'true' }))
    expect(result.exitCode).not.toBe(0)
    // The launcher writes its own diagnostic to STDOUT; WSL_UTF8=1 keeps it
    // UTF-8 (never UTF-16LE with its NUL interleaving).
    const diagnostic = result.stdout.text + result.stderr.text
    expect(diagnostic).toMatch(/\S/)
    expect(diagnostic).not.toContain('\u0000')
  })

  it('forwards the terminal overrides, caller env, and dshEnv through WSLENV', async () => {
    const { bash } = await setup()
    const result = await bash.run(bash.resolve({
      command: 'echo "[$TERM][$SEAM_VAR][$DSH_SEAM_VAR]"',
      env: { SEAM_VAR: 'env-ok' },
      dshEnv: { DSH_SEAM_VAR: 'dsh-ok' },
    }))
    expect(lf(result.stdout.text)).toBe('[dumb][env-ok][dsh-ok]\n')
  })

  it('resolve() carries stdin onto the spec, and run() threads it to the command', async () => {
    const { bash } = await setup()
    const spec = bash.resolve({ command: 'cat', stdin: 'piped\n' })
    expect(spec.stdin).toBe('piped\n')
    const result = await bash.run(spec)
    expect(lf(result.stdout.text)).toBe('piped\n')
  })

  it('resolve() omits stdin/env/dshEnv when the request supplies none', async () => {
    const { bash } = await setup()
    const spec = bash.resolve({ command: 'true' })
    expect('stdin' in spec).toBe(false)
    expect('env' in spec).toBe(false)
    expect('dshEnv' in spec).toBe(false)
  })

  it('caps per-call timeouts at maxTimeoutMs', async () => {
    const { bash } = await setup({ timeoutMs: 1_000, maxTimeoutMs: 2_000 })
    const result = await bash.run(bash.resolve({ command: 'echo ok', timeoutMs: 99_999 }))
    expect(result.timeoutMs).toBe(2_000)
  })

  it('rejects invalid numeric config and timeout overrides', async () => {
    await expect(setup({ timeoutMs: Number.NaN })).rejects.toThrow(/timeoutMs/)
    await expect(setup({ maxTimeoutMs: 0 })).rejects.toThrow(/maxTimeoutMs/)
    await expect(setup({ maxOutputBytes: -1 })).rejects.toThrow(/maxOutputBytes/)
    await expect(setup({ maxSpillBytes: 0 })).rejects.toThrow(/maxSpillBytes/)
    await expect(setup({ graceMs: 0 })).rejects.toThrow(/graceMs/)
    await expect(setup({ graceMs: MAX_TIMER_DELAY_MS + 1 }))
      .rejects.toThrow(`graceMs must be no greater than ${MAX_TIMER_DELAY_MS}`)

    const { bash } = await setup()
    expect(() => bash.resolve({ command: 'true', timeoutMs: Number.NaN })).toThrow(/request\.timeoutMs/)
    expect(() => bash.resolve({ command: 'true', timeoutMs: -1 })).toThrow(/request\.timeoutMs/)
    expect(() => bash.resolve({ command: 'true', stdoutMaxBytes: Number.NaN })).toThrow(/request\.stdoutMaxBytes/)
    expect(() => bash.resolve({ command: 'true', stdoutMaxBytes: -1 })).toThrow(/request\.stdoutMaxBytes/)
  })

  it('defaults stdoutMaxBytes to maxOutputBytes and lets foreground callers raise stdout only', async () => {
    const { bash } = await setup({ maxOutputBytes: 100 })
    expect(bash.resolve({ command: 'true' }).stdoutMaxBytes).toBe(100)

    const result = await bash.run(bash.resolve({
      command: 'printf "x%.0s" {1..500}; printf "e%.0s" {1..500} 1>&2',
      stdoutMaxBytes: 500,
    }))

    expect(result.stdout.text).toBe('x'.repeat(500))
    expect(result.stdout.truncated).toBe(false)
    expect(result.stderr.truncated).toBe(true)
    expect(result.stderr.text.length).toBeLessThanOrEqual(100)
  })

  it('per-call timeout takes precedence under the cap and kills on expiry', async () => {
    const { bash } = await setup({ timeoutMs: 60_000 })
    const result = await bash.run(bash.resolve({ command: 'sleep 60', timeoutMs: 300 }))
    expect(result.timedOut).toBe(true)
    // Mutually exclusive: a timeout classifies as timedOut, never also aborted.
    expect(result.aborted).toBe(false)
    expect(result.timeoutMs).toBe(300)
  })

  it('propagates abort signals', async () => {
    const { bash } = await setup()
    const controller = new AbortController()
    const pending = bash.run(bash.resolve({ command: 'sleep 60', signal: controller.signal }))
    setTimeout(() => { controller.abort() }, 300)
    const result = await pending
    expect(result.aborted).toBe(true)
    // Mutually exclusive: an upstream cancel classifies as aborted, never also timedOut.
    expect(result.timedOut).toBe(false)
  })

  it('classifies a self-killed command as neither timed out nor aborted', async () => {
    const { bash } = await setup({ timeoutMs: 60_000 })
    const result = await bash.run(bash.resolve({ command: 'kill -TERM $$' }))
    expect(result.timedOut).toBe(false)
    expect(result.aborted).toBe(false)
    // The Linux-side SIGTERM death reaches Windows as the relay's exit code,
    // never as a Windows-side signal fact; WSL releases have reported it both
    // as the bare signal number and as the shell convention 128+N.
    expect(result.signal).toBeNull()
    expect([15, 143]).toContain(result.exitCode)
  })
})

describe.skipIf(!hasWsl)('WslBashExecutor.start (background process handles)', () => {
  it('start returns immediately with a running handle that settles as completed', async () => {
    const { bash } = await setup()
    const before = Date.now()
    // The sleep outlasts any realistic spawn latency, so returning while the
    // child still sleeps proves start() does not wait for completion.
    const proc = bash.start(bash.resolve({ command: 'sleep 2; echo done' }))
    expect(Date.now() - before).toBeLessThan(1000)
    expect(proc.status).toBe('running')
    await proc.done
    expect(proc.status).toBe('completed')
    expect(proc.exitCode).toBe(0)
  })

  it('threads stdin and extra env into a background process', async () => {
    const { bash } = await setup()
    const proc = bash.start(bash.resolve({
      command: 'read line; echo "$line"; echo "[$BG_VAR][$DSH_BG_VAR]"',
      stdin: 'bg-stdin\n',
      env: { BG_VAR: 'bg-env' },
      dshEnv: { DSH_BG_VAR: 'bg-dsh-env' },
    }))
    const partialOutput = await readUntil(proc, '[bg-env][bg-dsh-env]')
    await proc.done
    const output = partialOutput + lf(proc.readOutput().delta)
    expect(output).toBe('bg-stdin\n[bg-env][bg-dsh-env]\n')
    expect(proc.exitCode).toBe(0)
  })

  it('readOutput is consuming: increments are never re-delivered, and reads stay valid after exit', async () => {
    const { bash } = await setup()
    const proc = bash.start(bash.resolve({ command: 'echo first; sleep 1; echo second' }))
    const first = await readUntil(proc, 'first\n')
    expect(lf(first)).toBe('first\n')
    await proc.done
    // Read-after-exit returns the remaining buffered output — once.
    const second = proc.readOutput()
    expect(lf(second.delta)).toBe('second\n')
    expect(second.lossy).toBe(false)
    expect(proc.readOutput().delta).toBe('')
  })

  it('readOutput marks stderr sections', async () => {
    const { bash } = await setup()
    const proc = bash.start(bash.resolve({ command: 'echo out; echo err 1>&2' }))
    await proc.done
    expect(lf(proc.readOutput().delta)).toBe('out\n[stderr]\nerr\n')
  })

  it('readOutput reports stderr-only deltas without a leading newline', async () => {
    const { bash } = await setup()
    const proc = bash.start(bash.resolve({ command: 'echo err 1>&2' }))
    await proc.done
    expect(lf(proc.readOutput().delta)).toBe('[stderr]\nerr\n')
  })

  it('readOutput adds a separator only when stdout lacks a trailing newline', async () => {
    const { bash } = await setup()
    const proc = bash.start(bash.resolve({ command: 'printf out; echo err 1>&2' }))
    await proc.done
    expect(lf(proc.readOutput().delta)).toBe('out\n[stderr]\nerr\n')
  })

  it('readOutput flags lossy reads and reports stdout spill paths', async () => {
    const { bash } = await setup({ maxOutputBytes: 100 })
    const proc = bash.start(bash.resolve({ command: 'for i in $(seq 100); do echo "line-$i"; done' }))
    await proc.done
    const read = proc.readOutput()
    // Window slid past offset 0 → lossy, spill path points at the full stream.
    expect(read.lossy).toBe(true)
    expect(read.stdoutSpillPath).toBeDefined()
  })

  it('readOutput reports stderr spill paths', async () => {
    const { bash } = await setup({ maxOutputBytes: 100 })
    const proc = bash.start(bash.resolve({ command: 'for i in $(seq 100); do echo "line-$i" 1>&2; done' }))
    await proc.done
    const read = proc.readOutput()
    expect(read.lossy).toBe(true)
    expect(read.stderrSpillPath).toBeDefined()
    expect(lf(read.delta)).toContain('[stderr]')
  })

  it('kill() terminates the process tree: true once, false after settlement', async () => {
    const { bash } = await setup()
    const proc = bash.start(bash.resolve({ command: 'sleep 60' }))
    expect(proc.kill()).toBe(true)
    await proc.done
    expect(proc.status).toBe('killed')
    expect(proc.kill()).toBe(false)
  })

  it('kill() returns false for a naturally completed process', async () => {
    const { bash } = await setup()
    const proc = bash.start(bash.resolve({ command: 'echo ok' }))
    await proc.done
    expect(proc.status).toBe('completed')
    expect(proc.kill()).toBe(false)
  })

  it('a spec.signal abort settles the handle as killed, not completed', async () => {
    const { bash } = await setup()
    const controller = new AbortController()
    const proc = bash.start(bash.resolve({ command: 'sleep 60', signal: controller.signal }))
    controller.abort()
    await proc.done
    expect(proc.status).toBe('killed')
  })

  it('a Linux-side self-signal reaches the handle as a completed nonzero exit', async () => {
    // The relay reports the Linux SIGTERM death as an exit code (bare signal
    // number or 128+N depending on the WSL release) with no Windows-side
    // signal, so the handle settles as completed — the exit code carries the
    // signal fact.
    const { bash } = await setup()
    const proc = bash.start(bash.resolve({ command: 'kill -TERM $$' }))
    await proc.done
    expect(proc.status).toBe('completed')
    expect([15, 143]).toContain(proc.exitCode)
    expect(proc.signal).toBeNull()
  })

  it('a background spawn failure settles as killed with the error readable on stderr', async () => {
    const { bash } = await setup()
    const missing = join(tmpdir(), 'dsh-wsl-missing', 'sub')
    const proc = bash.start(bash.resolve({ command: 'true', workdir: missing }))
    // done resolves (never rejects) even though the process never ran.
    await expect(proc.done).resolves.toBeUndefined()
    expect(proc.status).toBe('killed')
    expect(proc.readOutput().delta).toContain('spawn failed:')
  })
})

describe.skipIf(!hasWsl)('process lifecycle ownership (the subprocess service, not the executor)', () => {
  it('a background process survives executor-fiber disposal and settles with the subprocess service', async () => {
    const ctx = new Context()
    const managerFiber = await ctx.plugin(LocalSubprocessRuntime)
    ;(ctx.subprocess as LocalSubprocessRuntime).internals = { spillDir }
    const executorFiber = await ctx.plugin(WslBashExecutor, { graceMs: 200 })
    const bash = ctx.shell as WslBashExecutor

    const proc = bash.start(bash.resolve({ command: 'echo started; sleep 60' }))
    await readUntil(proc, 'started\n')

    // Executor reload/disposal leaves background work running — the handle
    // stays live and readable, mirroring the job runtime's
    // registrations-outlive-producer-fibers contract.
    await executorFiber.dispose()
    expect(proc.status).toBe('running')

    // Service disposal kills the relay tree and AWAITS its exit (no orphans on
    // the Windows side; the stdio hangup takes the foreground Linux command).
    await managerFiber.dispose()
    await proc.done
    expect(proc.status).not.toBe('running')
  })

  it('service disposal settles running handles and leaves settled ones untouched', async () => {
    const ctx = new Context()
    const managerFiber = await ctx.plugin(LocalSubprocessRuntime)
    ;(ctx.subprocess as LocalSubprocessRuntime).internals = { spillDir }
    await ctx.plugin(WslBashExecutor, { graceMs: 200 })
    const bash = ctx.shell as WslBashExecutor

    const finished = bash.start(bash.resolve({ command: 'echo done' }))
    await finished.done
    expect(finished.status).toBe('completed')
    const running = bash.start(bash.resolve({ command: 'sleep 60' }))

    await managerFiber.dispose()
    // A settled process was untouched; the live one was terminated and joined.
    expect(finished.status).toBe('completed')
    await running.done
    expect(running.status).not.toBe('running')
  })
})
