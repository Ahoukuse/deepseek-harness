/**
 * Model-facing `show_ui` tool: register a catalog-constrained widget spec
 * (json-render flat tree) and reference it into the reply for inline
 * rendering. Pure presentation — `execute` validates shallowly and returns a
 * reference id; the web client's `ui-embeds` plugin resolves the persisted
 * arguments and renders through its zod-validated component catalog, which is
 * the real vocabulary and security boundary. The model-facing component
 * reference lives in the bundled `show-ui-catalog` skill beside this package;
 * that document and the client catalog MUST evolve together.
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

/**
 * The component reference lives in the bundled `show-ui-catalog` skill
 * (`skills/show-ui-catalog/SKILL.md` beside this package), loaded on demand
 * through the skill tool; the prompt section below only routes to it. The
 * skill document and the client catalog (`ui-embeds/src/client/catalog.tsx`)
 * MUST evolve together — the client's zod catalog stays the authoritative
 * validation boundary.
 */
const CATALOG_SKILL = 'show-ui-catalog'

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
    text: `When a result calls for a dashboard-style widget (metrics, tables, charts), use the show_ui tool; before authoring a spec, load the ${CATALOG_SKILL} skill with the skill tool for the complete component reference. After registering, place the widget by writing \`![<title>](dsh-ui://<id>)\` on its own line in your reply.`,
  })

  ctx.tools.register(defineTool({
    name: 'show_ui',
    description: `Register a dashboard-style widget (metrics, tables, charts) for inline display and return its reference id. Place it in your reply by writing \`![<title>](dsh-ui://<id>)\` on its own line. The spec is a flat element tree {"root":"<key>","elements":{"<key>":{"type":"<Component>","props":{...},"children":[...]}}} using only cataloged components; load the ${CATALOG_SKILL} skill for the component reference before authoring a spec.`,
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
