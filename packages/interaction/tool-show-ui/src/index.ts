/**
 * Model-facing `show_ui` tool: register a catalog-constrained widget spec
 * (json-render flat tree) and reference it into the reply for inline
 * rendering. Pure presentation — `execute` validates shallowly and returns a
 * reference id; the web client's `ui-embeds` plugin resolves the persisted
 * arguments and renders through its zod-validated component catalog, which is
 * the real vocabulary and security boundary. The component enumeration in
 * this module's guidance text and the client catalog MUST evolve together.
 * @module @deepseek-ai/dsh-tool-show-ui
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-show-ui'

/** Services required by the tool. */
export const inject = ['tools', 'systemPrompt']

/** Default upper bound on one spec's serialized length, in characters. */
export const DEFAULT_MAX_SPEC_CHARS = 262_144

/** Plugin config: the spec size cap. */
export interface Config {
  /** Upper bound on one `show_ui` call's serialized spec length, in characters. Defaults to 262144. */
  maxSpecChars?: number
}

export const Config: z<Config> = z.object({
  maxSpecChars: z.number().default(DEFAULT_MAX_SPEC_CHARS),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/** The `show_ui` arguments after validation. */
export interface ShowUiArgs {
  /** The json-render flat-tree spec. */
  spec: Record<string, unknown>
  /** Short human-readable title for the widget. */
  title?: string
}

/**
 * Validate constraints the schema DSL can't express: a size-capped spec whose
 * shape is a json-render flat tree (`root` string naming an entry in an
 * `elements` record whose values carry a `type`). Deliberately shallow — the
 * client catalog validates component types and props; this gate only rejects
 * payloads that cannot be a spec at all. Throws a plain `Error` otherwise.
 *
 * @param args - the schema-validated `show_ui` arguments.
 * @param maxChars - the configured serialized-length cap.
 * @returns the accepted arguments, passed through unchanged.
 */
export function parseShowUiArgs(args: ShowUiArgs, maxChars: number): ShowUiArgs {
  const chars = JSON.stringify(args.spec).length
  if (chars > maxChars) {
    throw new Error(`spec serializes to ${String(chars)} characters; the limit is ${String(maxChars)}. Simplify the widget.`)
  }
  const root = args.spec.root
  const elements = args.spec.elements
  if (typeof root !== 'string' || root === '') throw new Error('spec.root must name the root element key')
  if (typeof elements !== 'object' || elements === null || Array.isArray(elements)) {
    throw new Error('spec.elements must be an object mapping element keys to elements')
  }
  const record = elements as Record<string, unknown>
  if (!(root in record)) throw new Error(`spec.elements is missing the root element "${root}"`)
  for (const [key, element] of Object.entries(record)) {
    if (typeof element !== 'object' || element === null || typeof (element as { type?: unknown }).type !== 'string') {
      throw new Error(`spec.elements["${key}"] must be an object with a string "type"`)
    }
  }
  return args
}

/** The pending-state card title: the widget's title, else a static label. */
function cardTitle(args: ShowUiArgs): string {
  const title = args.title?.trim()
  return title !== undefined && title !== '' ? title : 'UI'
}

/**
 * Pending-call presentation: a generic card titled by the widget's title.
 * @param args - the raw tool arguments; only `title` feeds the view.
 * @returns the generic card view shown while the call runs.
 */
export function presentShowUiCall(args: ShowUiArgs): GenericCallView {
  return { card: 'generic', title: cardTitle(args) }
}

/** The catalog vocabulary, enumerated for the model (client catalog is authoritative). */
const CATALOG_GUIDE = 'Components: Stack{direction?:"row"|"column",gap?} (children), Grid{columns:1-6} (children), Card{title?} (children), Text{content,variant?:"title"|"body"|"caption"}, Metric{label,value,unit?,delta?,trend?:"up"|"down"|"flat"}, Badge{label,tone?:"neutral"|"success"|"warning"|"danger"}, Progress{label?,value:0-100}, Table{columns:string[],rows:string[][]}, BarChart{title?,items:[{label,value}],unit?}, LineChart{title?,points:[{label,value}](min 2),unit?}, Sparkline{values:number[](min 2),label?}.'

/**
 * Register the `show_ui` tool and its system-prompt guidance. The tool's
 * disposer is fiber-scoped (the effect-based registries clean up on dispose),
 * so no manual teardown is needed.
 */
export function apply(ctx: Context, config: Config): void {
  // schemastery (Config) has already filled every defaulted field.
  const resolved = config as ResolvedConfig
  if (!Number.isInteger(resolved.maxSpecChars) || resolved.maxSpecChars < 1) {
    throw new Error('tool-show-ui: maxSpecChars must be a positive integer')
  }

  ctx.systemPrompt.section({
    name: 'tool:show_ui',
    order: 116,
    text: `Use the show_ui tool to register a dashboard-style widget (metrics, tables, charts), then place it in your reply: the tool returns an id, and writing \`![<title>](dsh-ui://<id>)\` on its own line renders the widget at that spot. Always place every registered widget this way. The spec is a flat tree: {"root":"<key>","elements":{"<key>":{"type":"<Component>","props":{...},"children":["<key>"...]}}}. ${CATALOG_GUIDE} No other component types exist; widgets are display-only.`,
  })

  ctx.tools.register(defineTool({
    name: 'show_ui',
    description: `Register a dashboard-style widget for inline display and return its reference id. Place it in your reply by writing \`![<title>](dsh-ui://<id>)\` on its own line. The spec is a flat element tree: {"root":"<key>","elements":{"<key>":{"type":"<Component>","props":{...},"children":[...]}}}. ${CATALOG_GUIDE}`,
    parameters: {
      spec: { type: 'object', required: true, additionalProperties: true, description: 'The widget spec: a flat tree with "root" and "elements", using only catalog components.' },
      title: { type: 'string', description: 'Short title describing the widget, shown as the card header.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          uiId: { type: 'string', required: true },
          chars: { type: 'number', required: true },
        },
      },
      render: (args, value) => [{
        type: 'text',
        text: `Widget stored (${cardTitle(args)}, ${String(value.chars)} characters). To display it, write this on its own line in your reply where the widget should appear: ![${cardTitle(args)}](dsh-ui://${value.uiId})`,
      }],
    },
    // Pure display of its own arguments; no parent-agent state is touched.
    isConcurrencySafe: () => true,
    execute(args, exec) {
      const input = parseShowUiArgs(args as ShowUiArgs, resolved.maxSpecChars)
      // The reference id IS the call id: unique per session, persisted with
      // the log, so prose references replay against the same vocabulary.
      return Promise.resolve({ uiId: String(exec.callId), chars: JSON.stringify(input.spec).length })
    },
    presentCall: args => presentShowUiCall(args as ShowUiArgs),
  }))
}
