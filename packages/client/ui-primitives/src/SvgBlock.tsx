// SvgBlock: the surface for the `svg` render intent — a model-authored vector
// graphic inlined into the conversation. The markup is UNTRUSTED model output
// and this component is its sanitization boundary: DOMPurify runs with the SVG
// profile before anything reaches the DOM. Inlining (rather than an <img data:
// URL) is a deliberate choice so the graphic's text stays selectable and
// `currentColor` follows the theme; the cost is that sanitization here is
// load-bearing. Beyond the profile, three tightenings close inline-specific
// holes: `<foreignObject>` is forbidden (it would smuggle arbitrary HTML into
// the host document), `<style>` is forbidden (an inline SVG's style element is
// document-global, so a graphic could restyle the whole app), and `<a>` is
// forbidden (a graphic is a picture, not a link surface — and DOMPurify alone
// would leave relative/scheme-odd hrefs the way MarkdownText never does).
// Geometry mirrors CodeBlock/TerminalBlock/WebBlock (12px radius, code-block
// surface, 16px vertical margin) so the graphic card reads as one family with
// them. The graphic renders inside a capped-height container that scrolls in
// place, the same posture as WebBlock's source list.

import { useMemo } from 'react'
import clsx from 'clsx'
import DOMPurify from 'dompurify'
import css from './SvgBlock.module.css'

/** A `show_svg` card: one sanitized inline vector graphic. */
export interface SvgBlockProps {
  /** The untrusted SVG markup; sanitized here before inlining. */
  svg: string
  /**
   * Copy shown when sanitization leaves no drawable root (the payload was not
   * really an SVG). Optional label prop with a Chinese default, matching the
   * zero-cordis localization posture of the other blocks.
   */
  invalidLabel?: string | undefined
  /** Extra class merged onto the wrapper (callers position; this component draws). */
  className?: string | undefined
}

/**
 * Sanitize untrusted SVG markup for inline rendering. Exported so tests pin
 * the boundary directly. The SVG profile drops scripts, event handlers, and
 * non-SVG elements; the FORBID list closes the inline-specific holes named in
 * the header comment. `USE_PROFILES` replaces DOMPurify's HTML allowlist, so
 * an HTML payload sanitizes to nothing rather than to inline-able HTML.
 * @param svg - the untrusted markup.
 * @returns the sanitized markup, or null when nothing drawable survives (the
 *   input was not an SVG document at all).
 */
export function sanitizeSvg(svg: string): string | null {
  const clean = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['foreignObject', 'style', 'a', 'animate', 'set'],
    // `use`/`image` href values may reference external documents; DOMPurify
    // already strips dangerous schemes, and the browser blocks cross-origin
    // `use`, so those stay. Scripting attributes go with the profile.
  })
  // DOMPurify returns a string for string input; an SVG-less residue (empty or
  // text-only) means the payload was not an SVG document.
  if (!clean.toLowerCase().includes('<svg')) return null
  return clean
}

/**
 * Render one model-authored SVG graphic, sanitized, inside the shared card
 * chrome. A payload whose sanitized residue has no `<svg>` root renders the
 * invalid-state note instead of an empty card.
 * @param props - see {@link SvgBlockProps}.
 * @returns the graphic card element.
 */
export function SvgBlock({ svg, invalidLabel, className }: SvgBlockProps) {
  const clean = useMemo(() => sanitizeSvg(svg), [svg])
  if (clean === null) {
    return (
      <div className={clsx(css.block, className)} data-svg="invalid">
        <div className={css.invalid}>{invalidLabel ?? '无法安全渲染此 SVG'}</div>
      </div>
    )
  }
  return (
    <div className={clsx(css.block, className)} data-svg="graphic">
      {/* Sanitized above — sanitizeSvg is this surface's one injection gate. */}
      <div className={css.canvas} dangerouslySetInnerHTML={{ __html: clean }} />
    </div>
  )
}
