/**
 * Model-facing `show_svg` tool: display a model-authored SVG graphic inline in
 * the conversation. Pure presentation — `execute` validates and returns a
 * receipt; the graphic reaches the user through the `svg` render intent
 * (`SvgResultView`), which carries the UNSANITIZED markup from the call
 * arguments. Sanitization is deliberately absent here: a pure presenter cannot
 * transform content, and each UI owns its sanitizer (the web client inlines
 * through DOMPurify). Validation in this module is a well-formedness and
 * budget gate, not a security boundary.
 * @module @deepseek-ai/dsh-tool-show-svg
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, SvgResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-show-svg'

/** Services required by the tool. */
export const inject = ['tools', 'systemPrompt']

/**
 * Default upper bound on one graphic's markup length, in characters. Owned by
 * the consumer (the product controls how much display payload one call may
 * persist into the session log), mirroring `dsh-tool-web`'s output caps.
 */
export const DEFAULT_MAX_SVG_CHARS = 512_000

/** Plugin config: the markup size cap. */
export interface Config {
  /** Upper bound on one `show_svg` call's markup length, in characters. Defaults to 512000. */
  maxSvgChars?: number
}

export const Config: z<Config> = z.object({
  maxSvgChars: z.number().default(DEFAULT_MAX_SVG_CHARS),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/** The `show_svg` arguments after validation. */
export interface ShowSvgArgs {
  /** Complete, self-contained SVG markup. */
  svg: string
  /** Short human-readable title for the graphic. */
  title?: string
}

/**
 * An optional XML declaration followed by an `<svg` root open tag. Whitespace
 * and case tolerant; deliberately shallow — the UI's sanitizer is the security
 * boundary, this gate only rejects payloads that cannot be SVG at all.
 */
const SVG_ROOT = /^\s*(?:<\?xml[^>]*\?>\s*)?<svg[\s>]/i

/**
 * Validate constraints the schema DSL can't express: a non-blank, size-capped
 * document whose root element is `<svg>` and that carries no DTD. Throws a
 * plain `Error` otherwise.
 *
 * The DTD rejection (`<!DOCTYPE` / `<!ENTITY`) is defense in depth against
 * entity-expansion payloads reaching any downstream XML parser; inline SVG
 * needs no DTD, so the rejection costs nothing legitimate.
 *
 * @param args - the schema-validated `show_svg` arguments.
 * @param maxChars - the configured markup length cap.
 * @returns the accepted arguments, passed through unchanged.
 */
export function parseShowSvgArgs(args: ShowSvgArgs, maxChars: number): ShowSvgArgs {
  const svg = args.svg
  if (svg.trim().length === 0) throw new Error('svg must be a non-empty string')
  if (svg.length > maxChars) {
    throw new Error(`svg markup is ${String(svg.length)} characters; the limit is ${String(maxChars)}. Simplify the graphic.`)
  }
  // Checked before the root gate: a DOCTYPE precedes the root element, so the
  // root regex would otherwise reject the document with the wrong diagnosis.
  if (/<!DOCTYPE|<!ENTITY/i.test(svg)) throw new Error('svg must not contain a DOCTYPE or ENTITY declaration')
  if (!SVG_ROOT.test(svg)) throw new Error('svg must be a complete document whose root element is <svg>')
  if (!svg.trimEnd().endsWith('</svg>')) throw new Error('svg must end with a closing </svg> tag')
  return args
}

/** The pending-state card title: the graphic's title, else a static label. */
function cardTitle(args: ShowSvgArgs): string {
  const title = args.title?.trim()
  return title !== undefined && title !== '' ? title : 'SVG'
}

/**
 * Pending-call presentation: a generic card titled by the graphic's title.
 * @param args - the raw tool arguments; only `title` feeds the view.
 * @returns the generic card view shown while the call runs.
 */
export function presentShowSvgCall(args: ShowSvgArgs): GenericCallView {
  return { card: 'generic', title: cardTitle(args) }
}

/**
 * Completed-call presentation: the `svg` card carrying the markup straight
 * from the call arguments (pure and replayable — the args are persisted with
 * the session log, so no `presentationMeta` is needed). The markup is
 * untrusted; the rendering UI sanitizes before inlining.
 *
 * @param args - the raw tool arguments; `svg` and `title` feed the view.
 * @param result - the final model-facing tool result.
 * @returns the svg result view, or `undefined` (generic card) on failure or a
 *   blank payload.
 */
export function presentShowSvgResult(args: ShowSvgArgs, result: ToolResult): SvgResultView | undefined {
  if (result.isError) return undefined
  // Soft-validated replay args can carry a blank string; an empty card row
  // beats a crashed one, so fall back to the generic card.
  if (args.svg.trim().length === 0) return undefined
  return { card: 'svg', title: cardTitle(args), svg: args.svg }
}

/**
 * Register the `show_svg` tool and its system-prompt guidance. The tool's
 * disposer is fiber-scoped (the effect-based registries clean up on dispose),
 * so no manual teardown is needed.
 */
export function apply(ctx: Context, config: Config): void {
  // schemastery (Config) has already filled every defaulted field.
  const resolved = config as ResolvedConfig
  if (!Number.isInteger(resolved.maxSvgChars) || resolved.maxSvgChars < 1) {
    throw new Error('tool-show-svg: maxSvgChars must be a positive integer')
  }

  ctx.systemPrompt.section({
    name: 'tool:show_svg',
    order: 115,
    text: 'Use the show_svg tool to register a static SVG graphic (diagram, chart, illustration), then place it in your reply: the tool returns an id, and writing `![<title>](dsh-svg://<id>)` on its own line in your reply renders the graphic at that spot. Always place every registered graphic this way. Provide complete, self-contained SVG markup with a viewBox. Scripts, event handlers, style elements, and foreignObject are stripped before display, so express everything through plain SVG shapes, paths, text, and presentation attributes.',
  })

  ctx.tools.register(defineTool({
    name: 'show_svg',
    description: 'Register a static SVG graphic for display and return its reference id. Place the graphic in your reply by writing `![<title>](dsh-svg://<id>)` on its own line where it should appear. Provide complete, self-contained SVG markup with a viewBox; scripts and external resources are stripped before display. Display envelope: the graphic scales to a chat card roughly 600-1000 CSS px wide (design for about 800), and heights beyond 480 px are cut off behind a scrollbar, so keep the aspect ratio within about 5:3 and size text to stay readable at that scale. The card supplies a theme-matched background and text color for both light and dark themes. For strokes and text whose readability would flip with the theme (near-black or near-white neutrals), use currentColor; a deliberate palette that stays readable in both themes is fine as designed. Leave the background transparent unless the graphic has a reason to bring its own.',
    parameters: {
      svg: { type: 'string', required: true, description: 'Complete SVG markup, from <svg> to </svg>. Must include a viewBox. No scripts, no external references.' },
      title: { type: 'string', description: 'Short title describing the graphic, shown as the card header.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          svgId: { type: 'string', required: true },
          chars: { type: 'number', required: true },
        },
      },
      render: (args, value) => [{
        type: 'text',
        text: `SVG stored (${cardTitle(args)}, ${String(value.chars)} characters). To display it, write this on its own line in your reply where the graphic should appear: ![${cardTitle(args)}](dsh-svg://${value.svgId})`,
      }],
    },
    // Pure display of its own arguments; no parent-agent state is touched.
    isConcurrencySafe: () => true,
    execute(args, exec) {
      const input = parseShowSvgArgs(args, resolved.maxSvgChars)
      // The reference id IS the call id: unique per session, persisted with
      // the log, so prose references replay against the same vocabulary.
      return Promise.resolve({ svgId: String(exec.callId), chars: input.svg.length })
    },
    presentCall: presentShowSvgCall,
    presentResult: (args, result) => presentShowSvgResult(args, result),
  }))
}
