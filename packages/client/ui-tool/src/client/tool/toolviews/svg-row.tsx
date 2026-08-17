// Svg toolview registrant: the keyed toolview hole for the `show_svg` tool.
// A compact receipt row: the graphic's primary display is the reply-prose
// reference (`![title](dsh-svg://<id>)`, rendered inline by the chat view's
// svg-refs mechanism), so the tool row stays a collapsed one-liner — the
// degrade path when the model forgot to reference the graphic, and the
// per-call inspection surface. Its expanded body carries the same svg card,
// collapsed by default like every other card row.

import type { Context } from '@deepseek-ai/cordis'
import { IconDataOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '../../contract/slots.ts'
import { svgCardModel } from '../models/svg-card-model.ts'
import { toolRowModel } from '../models/tool-call-model.ts'
import { ToolRow } from '../components/ToolRow.tsx'
import { CONVERSATION_NS as NS } from '../../locale.ts'

/** Full row props: the toolview runtime share plus the standard locale seat. */
type SvgRowProps = ToolCallViewProps & PropsLocale<'conversation'>

/**
 * Svg row: icon + SVG · {title} in the shared ToolRow chrome, with the
 * settled graphic's svg card as the row's collapsed-by-default card body.
 */
export function SvgRow({ toolName, block, inspect, t }: SvgRowProps) {
  const model = toolRowModel(toolName, block)
  const svg = svgCardModel(block)
  return (
    <ToolRow
      t={t}
      variant={model.variant}
      toolName={toolName}
      icon={<IconDataOutline16 size={14} />}
      title="SVG"
      summary={svg?.title ?? model.summary}
      body={null}
      // The receipt text is noise under the graphic, but it IS the row's
      // content when there is no card (an error, or a blank replayed payload).
      output={svg !== null ? null : model.output}
      errorSummary={model.errorSummary}
      svg={svg}
      state={model.state}
      inspect={inspect}
    />
  )
}

/**
 * The svg row follows the atomic Tool-view declaration across activation and
 * reload.
 */
export const svgToolview = {
  name: 'svg-toolview',
  inject: ['slots'],
  /**
   * Register the svg row under the `show_svg` keyed toolview hole.
   * @param ctx - registrant context (disposal rides ctx.effect inside slots.register).
   */
  apply(ctx: Context): void {
    ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'show_svg', locale: NS }, SvgRow))
  },
}
