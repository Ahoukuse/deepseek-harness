/**
 * Prose embed references: a display tool registers content and returns an id,
 * the model writes `![title](<scheme>://<id>)` on its own line in the reply,
 * and the chat view replaces that line with the registered renderer's output.
 * This module owns only the scheme-agnostic half — recognizing and splitting
 * reference lines out of settled reply text. Rendering is dispatched through
 * the keyed `conversation.chat.embed` slot (key = scheme), so an embed kind is
 * one slot registration in its owning plugin, and a scheme nobody registered
 * degrades to ordinary markdown, where MarkdownText's non-http image rule
 * keeps the alt text.
 */

/** Owner currency delivered to one keyed embed renderer. */
export interface ChatEmbedOwnerProps {
  /** The reference scheme (the slot dispatch key), e.g. `dsh-svg`. */
  scheme: string
  /** The reference id (by convention the registering tool's call id). */
  id: string
  /** The reference's alt text (the display title the model wrote). */
  alt: string
  /** The verbatim reference line, for degrade paths that re-render it as markdown. */
  raw: string
}

/** A whole line of reply prose that is exactly one embed reference. */
const EMBED_REF_LINE = /^!\[([^\]]*)\]\((dsh-[a-z][\w-]*):\/\/([\w.:-]+)\)\s*$/

/** One piece of a settled reply: prose, or an embed reference line. */
export type EmbedTextSegment =
  | { kind: 'text'; text: string }
  | { kind: 'embed'; scheme: string; id: string; alt: string; raw: string }

/**
 * Split settled reply text on standalone embed-reference lines. Only a line
 * that is exactly one reference splits; an inline mention stays prose (and
 * degrades to alt text through MarkdownText's image rules). Returns a single
 * text segment when the text carries no reference, so callers can keep the
 * plain path allocation-free.
 * @param text - one settled assistant text block.
 * @returns the ordered segments.
 */
export function splitEmbedRefs(text: string): EmbedTextSegment[] {
  if (!text.includes('](dsh-')) return [{ kind: 'text', text }]
  const segments: EmbedTextSegment[] = []
  let buffer: string[] = []
  const flush = (): void => {
    if (buffer.length === 0) return
    const joined = buffer.join('\n')
    if (joined.trim() !== '') segments.push({ kind: 'text', text: joined })
    buffer = []
  }
  for (const line of text.split('\n')) {
    const match = EMBED_REF_LINE.exec(line)
    if (match === null) {
      buffer.push(line)
      continue
    }
    flush()
    segments.push({ kind: 'embed', scheme: match[2] ?? '', id: match[3] ?? '', alt: match[1] ?? '', raw: line })
  }
  flush()
  return segments.length > 0 ? segments : [{ kind: 'text', text }]
}
