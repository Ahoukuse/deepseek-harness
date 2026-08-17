/**
 * Embed resolution against the conversation's settled tool calls. Both embed
 * kinds resolve by call id off the persisted arguments — `show_svg` carries its
 * markup and `show_ui` its spec in the call arguments, which is the one channel
 * present on every path (nested PTC dispatches carry no render-intent views,
 * and the client snapshot no longer surfaces result views at all). Lookups are
 * lazy per-call scans of the live node store: references
 * are rare, the node window is capped, and reading at render time means a
 * graphic that settles after an earlier miss resolves on the next render
 * without any cache invalidation.
 */
import type { ChatNodeStore, ToolCallBlock, ToolResultNode } from '@deepseek-ai/dsh-client-ui-chat/client'

/** One resolvable graphic: the untrusted markup plus its display title. */
export interface SvgRefGraphic {
  /** The untrusted SVG markup (SvgBlock sanitizes before inlining). */
  svg: string
  /** The display title, when the presenter or arguments carried one. */
  title?: string | undefined
}

/** One resolvable widget: the untrusted json-render spec plus its title. */
export interface UiRefWidget {
  /** The untrusted spec object (validated against the catalog at render). */
  spec: Record<string, unknown>
  /** The display title, when the arguments carried one. */
  title?: string | undefined
}

/** Parse a settled call's persisted arguments, null on malformed JSON. */
function argsOf(block: ToolResultNode): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(block.call?.argsRaw ?? '')
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

/** Depth-first search of one call tree for the block with the given call id. */
function findBlock(block: ToolCallBlock, id: string): ToolCallBlock | undefined {
  if (block.callId === id) return block
  for (const child of block.subCalls) {
    const found = findBlock(child, id)
    if (found !== undefined) return found
  }
  return undefined
}

/** The referenced settled call block, from any tool node in the store. */
function findCall(nodes: ChatNodeStore, id: string): ToolCallBlock | undefined {
  for (const node of nodes.values()) {
    if (node.kind !== 'tool-call') continue
    const found = findBlock((node.data as { root: ToolCallBlock }).root, id)
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * Resolve one `dsh-svg://<id>` reference to its graphic.
 * @param nodes - the chat node store off the session snapshot.
 * @param id - the reference id (the show_svg call id).
 * @returns the graphic, or undefined when no settled successful call carries it.
 */
export function resolveSvgGraphic(nodes: ChatNodeStore, id: string): SvgRefGraphic | undefined {
  const block = findCall(nodes, id)
  if (block === undefined || !('kind' in block)) return undefined
  if (block.isError || block.call?.name !== 'show_svg') return undefined
  const args = argsOf(block)
  if (args === null || typeof args.svg !== 'string' || args.svg === '') return undefined
  return {
    svg: args.svg,
    ...typeof args.title === 'string' && args.title !== '' ? { title: args.title } : {},
  }
}

/**
 * Resolve one `dsh-ui://<id>` reference to its widget spec.
 * @param nodes - the chat node store off the session snapshot.
 * @param id - the reference id (the show_ui call id).
 * @returns the widget, or undefined when no settled successful call carries it.
 */
export function resolveUiWidget(nodes: ChatNodeStore, id: string): UiRefWidget | undefined {
  const block = findCall(nodes, id)
  if (block === undefined || !('kind' in block)) return undefined
  if (block.isError || block.call?.name !== 'show_ui') return undefined
  const args = argsOf(block)
  if (args === null) return undefined
  const spec = args.spec
  if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) return undefined
  return {
    spec: spec as Record<string, unknown>,
    ...typeof args.title === 'string' && args.title !== '' ? { title: args.title } : {},
  }
}
