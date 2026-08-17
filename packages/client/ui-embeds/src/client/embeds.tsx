/**
 * The two embed renderers registered under `conversation.chat.embed`: `dsh-svg`
 * resolves a settled show_svg call into a sanitized SvgBlock, `dsh-ui`
 * resolves a settled show_ui call into the catalog-constrained widget
 * renderer. Both degrade to the raw reference line as ordinary markdown (alt
 * text survives) when the id resolves to nothing, and the widget renderer is
 * additionally wrapped in an error boundary so a malformed spec degrades to a
 * quiet note instead of unmounting the chat column.
 */
import { Component, type ReactNode } from 'react'
import { SvgBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-chat standard-kit merge (useChat) and the ui-chat
// SlotMap merge (the embed slot declaration).
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { Spec } from '@json-render/core'
import { resolveSvgGraphic, resolveUiWidget } from './resolve.ts'
import { WidgetRenderer } from './catalog.tsx'
import css from './widgets.module.css'

/** Full embed-renderer props: the keyed owner payload plus the session kit. */
type EmbedProps = PropsRuntime<'conversation.chat.embed'>

/** The `dsh-svg` embed: the referenced graphic, sanitized and inlined. */
export function SvgEmbed({ id, alt, useChat }: EmbedProps) {
  const nodes = useChat(s => s.nodes)
  const graphic = resolveSvgGraphic(nodes, id)
  // Unresolved reference: degrade to the alt text. Markdown's own image rule
  // rejects the non-http scheme and renders the same alt in the same style, so
  // an unclaimed and an unresolved reference read identically.
  if (graphic === undefined) return <span className={css.unresolved}>{alt}</span>
  return <SvgBlock svg={graphic.svg} />
}

/** Contain a malformed spec: json-render validates against the catalog, but a
 *  throw during render must degrade to a note, never unmount the chat column. */
class WidgetBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override render(): ReactNode {
    if (this.state.failed) return <div className={css.invalid}>无法渲染此界面组件</div>
    return this.props.children
  }
}

/** The `dsh-ui` embed: the referenced widget through the catalog renderer. */
export function UiEmbed({ id, alt, useChat }: EmbedProps) {
  const nodes = useChat(s => s.nodes)
  const widget = resolveUiWidget(nodes, id)
  if (widget === undefined) return <span className={css.unresolved}>{alt}</span>
  return (
    <div className={css.widgetRoot} data-embed="ui">
      <WidgetBoundary>
        <WidgetRenderer spec={widget.spec as unknown as Spec} />
      </WidgetBoundary>
    </div>
  )
}
