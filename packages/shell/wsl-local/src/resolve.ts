/**
 * WSL launcher resolution, dependency-free so non-package consumers (the
 * repository's coverage-gate probe in `vitest.config.ts`) can share the ONE
 * resolution definition with the executor and its suites — a probe that
 * resolved differently from the code under test could exempt a file whose
 * suites actually run.
 *
 * @module @deepseek-ai/dsh-wsl-local/resolve
 */

import { lstatSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Well-known Windows WSL launcher locations plus PATH entries. The inbox
 * launcher lives in System32, and a Store-updated WSL keeps a System32 shim,
 * so it stays the first candidate. Explicitly parameterized (env) so
 * resolution is a pure function of its inputs on every platform.
 * @param env - the environment to probe; defaults to the process environment.
 * @returns candidate `wsl.exe` launcher paths in resolution order.
 */
export function candidateWslPaths(env: NodeJS.ProcessEnv = process.env): string[] {
  const systemRoot = env.SystemRoot ?? 'C:\\Windows'
  const candidates = [join(systemRoot, 'System32', 'wsl.exe')]
  // A user-relocated launcher lives on PATH; entries may carry surrounding
  // quotes from `setx`-style definitions.
  for (const entry of (env.PATH ?? '').split(';')) {
    const trimmed = entry.trim().replace(/^"|"$/g, '')
    if (trimmed.length === 0) continue
    candidates.push(join(trimmed, 'wsl.exe'))
  }
  return candidates
}

/**
 * Whether a candidate can be spawned. lstat opens the entry itself instead of
 * following reparse points, so it sees a Store app execution alias where stat
 * hits the target's ACL (EACCES); Node reports that alias as a symlink on
 * current releases and as a plain file on older ones, and CreateProcess
 * resolves either shape. A real directory never matches.
 */
function candidateExists(candidate: string): boolean {
  try {
    const stat = lstatSync(candidate)
    return stat.isFile() || stat.isSymbolicLink()
  } catch {
    // ENOENT (the candidate vanished between listing and probing) is the only
    // expected failure; any other error names an unspawnable path, so false
    // is the safe answer for it too.
    return false
  }
}

/**
 * Resolve the WSL launcher this executor spawns.
 * @param configured - an explicit `wslPath` config value, trusted as-is.
 * @param env - the environment to probe on Windows; defaults to the process environment.
 * @param platform - the platform to resolve for; defaults to the process platform.
 * @returns the first existing well-known location on Windows (the System32
 *   launcher, then PATH entries), else `wsl.exe` for PATH resolution.
 */
export function resolveWslPath(
  configured?: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (configured !== undefined && configured.length > 0) return configured
  if (platform === 'win32') {
    for (const candidate of candidateWslPaths(env)) {
      if (candidateExists(candidate)) return candidate
    }
  }
  return 'wsl.exe'
}
