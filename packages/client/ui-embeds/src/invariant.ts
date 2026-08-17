/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-embeds`.
 * @module @deepseek-ai/dsh-client-ui-embeds/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-embeds'

/** Cordis companion plugin name. */
export const name = 'ui-embeds-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this browser surface plugin has no host-side lifecycle stream; its
 * registrations ride slot effects that dispose with the fiber.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
