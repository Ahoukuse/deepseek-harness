/**
 * Pure derivation of the svg-card props from a frozen call slice: a settled
 * successful `show_svg` call carries its markup in the persisted arguments,
 * and this is the one place that turns it into what {@link SvgBlock} draws.
 * Both conversation render sites (the chat tool row's expanded body and the
 * details panel's Output section) call this, so the card material they show is
 * derived once.
 *
 * The svg card is result-only by contract: a running call always takes the
 * generic path. The markup itself stays untrusted here — SvgBlock owns
 * sanitization; this model only guards the wire shape.
 * @module
 */
import type { SvgBlockProps } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallBlock } from './tool-call-model.ts'

/** The derived svg-card material: the block props plus the replacement title. */
export interface SvgCardModel {
  /** The card body SvgBlock draws. */
  card: SvgBlockProps
  /** The result view's replacement title, when it carries one. */
  title?: string | undefined
}

/**
 * Derive the svg-card material for a tool call, or null when this call is not
 * an svg card and belongs on the generic path. Null cases, all of them the
 * documented generic-card default: a running call (no `resultView` yet), a
 * settled call whose result view is not an svg card (including a `card` value
 * this UI version does not know), and a wire payload whose `svg` field is not
 * a non-empty string (the wire cannot be trusted to match the compiled union).
 * @param block - RunningToolCall or ToolResultNode off the snapshot caches.
 * @returns the svg-card material, or null for the generic path.
 */
export function svgCardModel(block: ToolCallBlock): SvgCardModel | null {
  // Running calls have no settled result; the svg card is result-only.
  if (!('kind' in block)) return null
  // Name-gated before parsing so the generic path never JSON-parses foreign
  // calls' arguments.
  if (block.isError || block.call?.name !== 'show_svg') return null
  try {
    const args = JSON.parse(block.call.argsRaw) as { svg?: unknown; title?: unknown }
    if (typeof args.svg !== 'string' || args.svg === '') return null
    return {
      card: { svg: args.svg },
      ...typeof args.title === 'string' && args.title !== '' ? { title: args.title } : {},
    }
  } catch {
    return null
  }
}
