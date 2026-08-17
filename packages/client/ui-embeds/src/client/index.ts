/**
 * Embed surface plugin, browser half: registers the `dsh-svg` and `dsh-ui`
 * renderers under the keyed `conversation.chat.embed` slot (key = reference
 * scheme). Resolution reads the conversation snapshot through the standard
 * session kit, so this plugin needs only the slot registry itself.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the renderer-owned slots service (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ui-chat SlotMap merge (the embed slot).
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import { SvgEmbed, UiEmbed } from './embeds.tsx'

export { SvgEmbed, UiEmbed } from './embeds.tsx'
export { resolveSvgGraphic, resolveUiWidget } from './resolve.ts'
export type { SvgRefGraphic, UiRefWidget } from './resolve.ts'
export { catalog, WidgetRenderer } from './catalog.tsx'

/** Required service: the slot registry that owns the embed seat. */
export const inject = ['slots']

/**
 * Client plugin body: the two scheme-keyed embed registrations.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.chat.embed', function* () {
    yield ctx.slots.register({ name: 'conversation.chat.embed', key: 'dsh-svg' }, SvgEmbed)
    yield ctx.slots.register({ name: 'conversation.chat.embed', key: 'dsh-ui' }, UiEmbed)
  })
}
