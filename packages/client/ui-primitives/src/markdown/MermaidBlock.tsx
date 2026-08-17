/**
 * MermaidBlock: the settled render for ```mermaid fences. The mermaid module
 * (multi-MB with its d3 tree) loads through a module-level dynamic import on
 * first use — the shiki lazy-grammar pattern in `highlight.ts` — so a session
 * that never renders a diagram pays neither download nor init. While the
 * module loads, and whenever mermaid rejects the source (models miswrite the
 * DSL routinely), the fence renders as the plain {@link CodeBlock}, so every
 * failure mode degrades to what the fence looked like before this component
 * existed.
 *
 * Sanitization boundary: mermaid runs with `securityLevel: 'strict'`, which
 * sanitizes label text through its bundled DOMPurify and strips click/script
 * bindings. Its output is NOT routed through SvgBlock — the diagram SVG
 * carries a `<style>` scoped to the diagram id that SvgBlock's profile would
 * strip — and that is sound because the input here is a constrained DSL the
 * renderer compiles, never model-authored markup.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { CodeBlock } from './CodeBlock.tsx'
import css from './MermaidBlock.module.css'

type MermaidModule = typeof import('mermaid').default

let loader: Promise<MermaidModule> | undefined

/**
 * Every diagram family renders at its absolute size (`useMaxWidth: false`).
 * The default fit-to-container arm emits `width="100%"` with a `max-width`
 * cap, which both scales wide diagrams down until their text is unreadable
 * and collapses inside this component's `fit-content` wrapper (a percentage
 * width cannot resolve against a shrink-wrapped container). Absolute size
 * keeps text at its designed size; the scroll container and the zoom chip
 * carry the overflow. Enumerated per family because mermaid has no root
 * switch; every config in v11 extends BaseDiagramConfig, so each key here
 * accepts the flag.
 */
const NO_FIT = { useMaxWidth: false }
const ABSOLUTE_SIZE = {
  flowchart: NO_FIT,
  swimlane: NO_FIT,
  sequence: NO_FIT,
  gantt: NO_FIT,
  journey: NO_FIT,
  timeline: NO_FIT,
  class: NO_FIT,
  state: NO_FIT,
  er: NO_FIT,
  pie: NO_FIT,
  quadrantChart: NO_FIT,
  xyChart: NO_FIT,
  requirement: NO_FIT,
  architecture: NO_FIT,
  mindmap: NO_FIT,
  ishikawa: NO_FIT,
  kanban: NO_FIT,
  gitGraph: NO_FIT,
  c4: NO_FIT,
  sankey: NO_FIT,
  packet: NO_FIT,
  block: NO_FIT,
  eventmodeling: NO_FIT,
  treeView: NO_FIT,
  radar: NO_FIT,
  venn: NO_FIT,
  'wardley-beta': NO_FIT,
  cynefin: NO_FIT,
  railroad: NO_FIT,
}

/**
 * Load and initialize the mermaid singleton on first use. The theme is read
 * once at init from the body's `data-ds-dark-theme` attribute (the ui-theme
 * plugin's dark marker); diagrams rendered before a theme switch keep their
 * colors until remounted, an accepted v1 limit.
 * @returns The initialized mermaid API.
 */
function loadMermaid(): Promise<MermaidModule> {
  loader ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'default',
      ...ABSOLUTE_SIZE,
    })
    return mermaid
  })
  return loader
}

/** Monotonic render ids: `mermaid.render` needs a document-unique element id per call. */
let renderSeq = 0

/** Zoom bounds and the multiplicative step; 1/1.25 steps stay exact in binary long enough for the clamp. */
const MIN_SCALE = 0.5
const MAX_SCALE = 4
const SCALE_STEP = 1.25

export interface MermaidBlockProps {
  /** The fence body, exactly as authored. */
  code: string
  /** Copy-button idle label forwarded to the CodeBlock fallback arms. */
  copyLabel: string
  /** Copy-button confirmation label forwarded to the CodeBlock fallback arms. */
  copiedLabel: string
}

export function MermaidBlock({ code, copyLabel, copiedLabel }: MermaidBlockProps) {
  // undefined = module loading or render in flight; null = mermaid rejected
  // the source. Both arms show the plain fence, so the distinction only
  // gates whether a later resolution may still swap the diagram in.
  const [svg, setSvg] = useState<string | null | undefined>(undefined)
  // The zoom. Each newly rendered diagram auto-fits to the column below
  // (which also discards the previous zoom when the source changes: a new
  // diagram gets a fresh fit, not a stale magnification).
  const [scale, setScale] = useState(1)
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let cancelled = false
    setSvg(undefined)
    const id = `dsh-mermaid-${++renderSeq}`
    void loadMermaid()
      .then(async (mermaid) => {
        // parse-first keeps invalid source out of render, which on some
        // mermaid versions leaves error artifacts in the document.
        await mermaid.parse(code)
        return mermaid.render(id, code)
      })
      .then((rendered) => {
        if (!cancelled) setSvg(rendered.svg)
      })
      .catch(() => {
        // A failed render may have parked its scratch element in the
        // document; drop it along with the diagram attempt.
        document.getElementById(id)?.remove()
        if (!cancelled) setSvg(null)
      })
    return () => { cancelled = true }
  }, [code])
  // Initial fit, measured before paint: a diagram wider than the column
  // starts scaled down to fit (never up past 100%), so the whole shape is
  // visible by default and the chip shows the true ratio; 100% via the chip
  // is the diagram's absolute size. Skipped when either measure is
  // unavailable (e.g. non-layouting test DOMs), leaving the scale at 1.
  useLayoutEffect(() => {
    if (typeof svg !== 'string') return
    const scroll = scrollRef.current
    if (scroll === null) return
    const diagram = scroll.querySelector('svg')
    if (diagram === null) return
    // useMaxWidth: false writes the absolute pixel width as the width
    // attribute; the viewBox is the fallback measure (guarded: test DOMs
    // leave SVGSVGElement.viewBox unimplemented).
    const natural = Number.parseFloat(diagram.getAttribute('width') ?? '')
      || ((diagram as Partial<SVGSVGElement>).viewBox?.baseVal.width ?? 0)
    const available = scroll.clientWidth
    if (natural > 0 && available > 0) setScale(Math.min(1, available / natural))
  }, [svg])
  if (typeof svg !== 'string') {
    return <CodeBlock code={code} lang="mermaid" copyLabel={copyLabel} copiedLabel={copiedLabel} />
  }
  return (
    <div className={css.block}>
      <div className={css.controls}>
        <button
          type="button"
          className={css.zoomButton}
          aria-label="缩小"
          onClick={() => { setScale(current => Math.max(MIN_SCALE, current / SCALE_STEP)) }}
        >
          −
        </button>
        <button
          type="button"
          className={css.zoomButton}
          aria-label="恢复原始大小"
          onClick={() => { setScale(1) }}
        >
          {`${Math.round(scale * 100)}%`}
        </button>
        <button
          type="button"
          className={css.zoomButton}
          aria-label="放大"
          onClick={() => { setScale(current => Math.min(MAX_SCALE, current * SCALE_STEP)) }}
        >
          +
        </button>
      </div>
      <div ref={scrollRef} className={css.scroll}>
        {/* Zoom travels as a custom property (the sheet applies `zoom: var(…)`):
            CSS `zoom` scales layout too, so the scroll container's extent and
            centering follow the scaled size, which a `transform` would not do. */}
        <div
          className={css.content}
          style={{ '--dsh-mermaid-zoom': scale } as CSSProperties}
          // mermaid's output is the shape tree it compiled from the parsed DSL
          // (strict mode sanitized the label text): the sanctioned innerHTML
          // consumption path, as with shiki's output in CodeBlock.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  )
}
