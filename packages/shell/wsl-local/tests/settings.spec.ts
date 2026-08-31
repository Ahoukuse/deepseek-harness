/** The `shell` settings section layered over the WSL executor's composition entry. */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Fiber } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { SHELL_SETTINGS_NAMESPACE } from '@deepseek-ai/dsh-shell'
import { WslBashExecutor } from '@deepseek-ai/dsh-wsl-local'

/** The smallest real provider: one in-memory document, always writable. */
class MemorySettings extends SettingsProvider {
  doc: Record<string, unknown> = {}

  get writable(): boolean {
    return true
  }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc = { ...this.doc, [ns]: structuredClone(section) }
    return Promise.resolve()
  }
}

async function boot(config: ConstructorParameters<typeof WslBashExecutor>[1] = {}): Promise<{
  ctx: Context
  settingsFiber: Fiber
  executorFiber: Fiber
  bash: WslBashExecutor
}> {
  const ctx = new Context()
  await ctx.plugin(LocalSubprocessRuntime)
  const settingsFiber = ctx.plugin(MemorySettings)
  await settingsFiber.await()
  const executorFiber = ctx.plugin(WslBashExecutor, { timeoutMs: 60_000, ...config })
  await executorFiber.await()
  return { ctx, settingsFiber, executorFiber, bash: ctx.shell as WslBashExecutor }
}

describe('wsl settings section', () => {
  it('resolves the user layer over the composition entry', async () => {
    const bench = await boot()
    expect(bench.bash.config.timeoutMs).toBe(60_000)

    await bench.ctx.settings.update(SHELL_SETTINGS_NAMESPACE, { timeoutMs: 5_000 })

    expect(bench.bash.config.timeoutMs).toBe(5_000)
    await bench.ctx.fiber.dispose()
  })

  it('refuses a stored value the constructor would have rejected', async () => {
    const bench = await boot()

    await expect(bench.ctx.settings.update(SHELL_SETTINGS_NAMESPACE, { timeoutMs: 0 }))
      .rejects.toThrow(/positive finite/)

    expect(bench.bash.config.timeoutMs).toBe(60_000)
    await bench.ctx.fiber.dispose()
  })

  it('re-resolves the launcher only when a stored wslPath differs', async () => {
    const bench = await boot({ wslPath: 'X:\\first\\wsl.exe' })
    expect(bench.bash.wslPath).toBe('X:\\first\\wsl.exe')

    // An unrelated change keeps the resolved launcher identity.
    await bench.ctx.settings.update(SHELL_SETTINGS_NAMESPACE, { timeoutMs: 5_000 })
    expect(bench.bash.wslPath).toBe('X:\\first\\wsl.exe')

    // A wslPath change re-resolves (an explicit path is trusted verbatim).
    await bench.ctx.settings.update(SHELL_SETTINGS_NAMESPACE, { wslPath: 'X:\\second\\wsl.exe' })
    expect(bench.bash.wslPath).toBe('X:\\second\\wsl.exe')
    await bench.ctx.fiber.dispose()
  })

  it('serves the stored section to every later read', async () => {
    const bench = await boot()
    await bench.ctx.settings.update(SHELL_SETTINGS_NAMESPACE, { maxOutputBytes: 1_024, cwd: '/tmp', distribution: 'Ubuntu' })

    const spec = bench.bash.resolve({ command: 'true' })

    expect(spec.stdoutMaxBytes).toBe(1_024)
    expect(spec.workdir).toBe('/tmp')
    expect(bench.bash.config.distribution).toBe('Ubuntu')
    await bench.ctx.fiber.dispose()
  })

  it('falls back to the composition entry when the settings provider detaches', async () => {
    const bench = await boot()
    await bench.ctx.settings.update(SHELL_SETTINGS_NAMESPACE, { timeoutMs: 5_000 })
    expect(bench.bash.config.timeoutMs).toBe(5_000)

    await bench.settingsFiber.dispose()

    expect(bench.bash.config.timeoutMs).toBe(60_000)
    await bench.ctx.fiber.dispose()
  })

  it('keeps the composition entry when no settings provider is mounted', async () => {
    const ctx = new Context()
    await ctx.plugin(LocalSubprocessRuntime)
    await ctx.plugin(WslBashExecutor, { timeoutMs: 1_234 })

    expect((ctx.shell as WslBashExecutor).config.timeoutMs).toBe(1_234)
    await ctx.fiber.dispose()
  })

  it('releases the namespace when the executor unloads', async () => {
    const bench = await boot()
    expect(bench.ctx.settings.describe().map(row => String(row.ns))).toContain('shell')

    await bench.executorFiber.dispose()

    expect(bench.ctx.settings.describe().map(row => String(row.ns))).not.toContain('shell')
    await bench.ctx.fiber.dispose()
  })
})
