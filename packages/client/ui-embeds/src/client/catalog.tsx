/**
 * The v1 widget catalog: dashboard / data-visualization vocabulary. The
 * catalog is the security and expressiveness boundary of `show_ui` — the
 * model can only reference components declared here, with zod-validated
 * props, and v1 deliberately declares NO actions, so a widget cannot trigger
 * side effects. The model-facing reference for this same vocabulary is the
 * `show-ui-catalog` skill (`tool-show-ui/skills/show-ui-catalog/SKILL.md`);
 * the two MUST evolve together.
 */
import type { MouseEvent as ReactMouseEvent } from 'react'
import { Children, useRef, useState } from 'react'
import { defineCatalog } from '@json-render/core'
import { schema } from '@json-render/react/schema'
import { createRenderer } from '@json-render/react'
import { z } from 'zod'
import css from './widgets.module.css'

/** Catalog prop values → CSS flex keywords (the catalog spells them shorter). */
const FLEX_ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' } as const
const FLEX_JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' } as const

/**
 * Normalize a value series into SVG polyline points over a unit-ish viewBox.
 * A flat series (min === max) draws a centered horizontal line.
 * @param values - the series, in order.
 * @param width - viewBox width.
 * @param height - viewBox height.
 * @param pad - vertical padding inside the viewBox.
 * @returns the `points` attribute string.
 */
function polylinePoints(values: number[], width: number, height: number, pad: number): string {
  return scaledPoints(values, Math.min(...values), Math.max(...values), width, height, pad)
}

/**
 * {@link polylinePoints} against an externally fixed value range, so several
 * series drawn into one viewBox share a scale (one axis, never two).
 * @param values - one series, in order.
 * @param min - the shared range minimum.
 * @param max - the shared range maximum.
 * @param width - viewBox width.
 * @param height - viewBox height.
 * @param pad - vertical padding inside the viewBox.
 * @returns the `points` attribute string.
 */
function scaledPoints(values: number[], min: number, max: number, width: number, height: number, pad: number): string {
  const span = max - min
  return values.map((value, i) => {
    const x = values.length === 1 ? 0 : (i / (values.length - 1)) * width
    const y = span === 0 ? height / 2 : height - pad - ((value - min) / span) * (height - 2 * pad)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
}

/**
 * The categorical series color for a slot index: a fixed order validated for
 * CVD and normal-vision separation against the card surfaces in both themes
 * (`--dsh-cat-*` in widgets.module.css). The order is the safety mechanism:
 * colors follow the entity's slot and are never cycled — the schemas cap
 * series counts at the palette size (8 adjacent, 3 for all-pairs scatter).
 * @param index - zero-based series/slice index.
 * @returns the CSS color value.
 */
function seriesColor(index: number): string {
  return `var(--dsh-cat-${String(index + 1)})`
}

/**
 * Pointer-following hover tooltip for charts. `move` anchors the tip at the
 * pointer, host-relative; `hide` clears it. The host element must carry
 * `css.tipHost` (position: relative) and the returned ref, and render
 * `<Tooltip tip={tip} />` as its last child.
 */
function useTooltip() {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [tip, setTip] = useState<{ left: number; top: number; lines: string[] } | null>(null)
  const move = (event: ReactMouseEvent, lines: string[]) => {
    const rect = hostRef.current?.getBoundingClientRect()
    if (!rect) return
    setTip({ left: event.clientX - rect.left, top: event.clientY - rect.top, lines })
  }
  const hide = () => { setTip(null) }
  return { hostRef, tip, move, hide }
}

/** The floating tip body; pointer-events: none keeps it out of hit-testing. */
function Tooltip({ tip }: { tip: { left: number; top: number; lines: string[] } | null }) {
  if (tip === null) return null
  return (
    <div className={css.tooltip} style={{ left: tip.left, top: tip.top }} role="status">
      {tip.lines.map((line, i) => <div key={i}>{line}</div>)}
    </div>
  )
}

/**
 * Legend chip row: identity rides the colored mark; text stays in text
 * tokens. With `onHover` the legend doubles as a series highlighter: hovering
 * an entry reports its index, leaving the row reports null, and the `active`
 * entry gets the emphasized text treatment.
 */
function ChartLegend({ labels, active, onHover }: {
  labels: string[]
  active?: number | null
  onHover?: (index: number | null) => void
}) {
  return (
    <div className={css.chartLegend} onMouseLeave={onHover === undefined ? undefined : () => { onHover(null) }}>
      {labels.map((label, i) => (
        <span
          key={i}
          className={css.legendEntry}
          data-active={active === i ? 'true' : undefined}
          onMouseEnter={onHover === undefined ? undefined : () => { onHover(i) }}
        >
          <span className={css.legendChip} style={{ background: seriesColor(i) }} />
          {label}
        </span>
      ))}
    </div>
  )
}

export const catalog = defineCatalog(schema, {
  components: {
    Stack: {
      props: z.object({
        direction: z.enum(['row', 'column']).optional(),
        gap: z.number().min(0).max(48).optional(),
        align: z.enum(['start', 'center', 'end', 'stretch']).optional(),
        justify: z.enum(['start', 'center', 'end', 'between']).optional(),
        wrap: z.boolean().optional(),
      }),
      slots: ['default'],
    },
    Grid: {
      props: z.object({
        columns: z.number().int().min(1).max(6),
        // Positional, like StackedBarChart's series/values: spans[i] is the
        // column span of the i-th child (default 1, clamped to `columns`).
        spans: z.array(z.number().int().min(1).max(6)).optional(),
      }),
      slots: ['default'],
    },
    Card: {
      props: z.object({
        title: z.string().optional(),
        subtitle: z.string().optional(),
        dense: z.boolean().optional(),
      }),
      slots: ['default'],
    },
    Text: {
      props: z.object({
        content: z.string(),
        variant: z.enum(['title', 'body', 'caption']).optional(),
      }),
    },
    Metric: {
      props: z.object({
        label: z.string(),
        value: z.string(),
        unit: z.string().optional(),
        delta: z.string().optional(),
        trend: z.enum(['up', 'down', 'flat']).optional(),
      }),
    },
    Badge: {
      props: z.object({
        label: z.string(),
        tone: z.enum(['neutral', 'success', 'warning', 'danger']).optional(),
      }),
    },
    Progress: {
      props: z.object({
        label: z.string().optional(),
        value: z.number().min(0).max(100),
      }),
    },
    Table: {
      props: z.object({
        columns: z.array(z.string()).min(1),
        rows: z.array(z.array(z.string())),
      }),
    },
    BarChart: {
      props: z.object({
        title: z.string().optional(),
        items: z.array(z.object({ label: z.string(), value: z.number().min(0) })).min(1),
        unit: z.string().optional(),
      }),
    },
    LineChart: {
      props: z.object({
        title: z.string().optional(),
        points: z.array(z.object({ label: z.string(), value: z.number() })).min(2),
        unit: z.string().optional(),
      }),
    },
    Sparkline: {
      props: z.object({
        values: z.array(z.number()).min(2),
        label: z.string().optional(),
      }),
    },
    ColumnChart: {
      props: z.object({
        title: z.string().optional(),
        items: z.array(z.object({ label: z.string(), value: z.number().min(0) })).min(1).max(12),
        unit: z.string().optional(),
      }),
    },
    PieChart: {
      props: z.object({
        title: z.string().optional(),
        items: z.array(z.object({ label: z.string(), value: z.number().min(0) })).min(1).max(8),
        donut: z.boolean().optional(),
        unit: z.string().optional(),
      }),
    },
    MultiLineChart: {
      props: z.object({
        title: z.string().optional(),
        series: z.array(z.object({ label: z.string(), values: z.array(z.number()).min(2) })).min(1).max(8),
        xLabels: z.array(z.string()).optional(),
        unit: z.string().optional(),
      }),
    },
    StackedBarChart: {
      props: z.object({
        title: z.string().optional(),
        series: z.array(z.string()).min(1).max(8),
        rows: z.array(z.object({ label: z.string(), values: z.array(z.number().min(0)).min(1) })).min(1),
        unit: z.string().optional(),
      }),
    },
    ScatterPlot: {
      props: z.object({
        title: z.string().optional(),
        // max 3: the palette validates all-pairs separation (scatter dots mix
        // freely, so every color pair is adjacent) only for the first three slots.
        series: z.array(z.object({
          label: z.string(),
          points: z.array(z.object({ x: z.number(), y: z.number() })).min(1),
        })).min(1).max(3),
        xLabel: z.string().optional(),
        yLabel: z.string().optional(),
      }),
    },
  },
  // v1 declares NO actions: a widget cannot trigger side effects.
  actions: {},
})

/**
 * The catalog's React implementations, compiled by `createRenderer` into one
 * component taking `{ spec }`. Pure presentation over design tokens; every
 * value arrives catalog-validated.
 */
export const WidgetRenderer = createRenderer(catalog, {
  Stack: ({ element, children }) => (
    <div
      className={css.stack}
      data-direction={element.props.direction ?? 'column'}
      style={{
        gap: element.props.gap ?? 8,
        alignItems: element.props.align === undefined ? undefined : FLEX_ALIGN[element.props.align],
        justifyContent: element.props.justify === undefined ? undefined : FLEX_JUSTIFY[element.props.justify],
        flexWrap: element.props.wrap === undefined ? undefined : element.props.wrap ? 'wrap' : 'nowrap',
      }}
    >
      {children}
    </div>
  ),
  Grid: ({ element, children }) => {
    const columns = element.props.columns
    const spans = element.props.spans
    return (
      <div className={css.grid} style={{ gridTemplateColumns: `repeat(${String(columns)}, minmax(0, 1fr))` }}>
        {spans === undefined
          ? children
          : Children.map(children, (child, i) => (
            <div className={css.gridItem} style={{ gridColumn: `span ${String(Math.min(spans[i] ?? 1, columns))}` }}>
              {child}
            </div>
          ))}
      </div>
    )
  },
  Card: ({ element, children }) => (
    <div className={css.card} data-dense={element.props.dense === true ? 'true' : undefined}>
      {(element.props.title !== undefined || element.props.subtitle !== undefined) && (
        <div className={css.cardHeader}>
          {element.props.title !== undefined && <div className={css.cardTitle}>{element.props.title}</div>}
          {element.props.subtitle !== undefined && <div className={css.cardSubtitle}>{element.props.subtitle}</div>}
        </div>
      )}
      {children}
    </div>
  ),
  Text: ({ element }) => (
    <div className={css.text} data-variant={element.props.variant ?? 'body'}>{element.props.content}</div>
  ),
  Metric: ({ element }) => (
    <div className={css.metric}>
      <div className={css.metricLabel}>{element.props.label}</div>
      <div className={css.metricValue}>
        {element.props.value}
        {element.props.unit !== undefined && <span className={css.metricUnit}>{element.props.unit}</span>}
      </div>
      {element.props.delta !== undefined && (
        <div className={css.metricDelta} data-trend={element.props.trend ?? 'flat'}>{element.props.delta}</div>
      )}
    </div>
  ),
  Badge: ({ element }) => (
    <span className={css.badge} data-tone={element.props.tone ?? 'neutral'}>{element.props.label}</span>
  ),
  Progress: ({ element }) => {
    const value = Math.max(0, Math.min(100, element.props.value))
    return (
      <div className={css.progress}>
        {element.props.label !== undefined && <div className={css.progressLabel}>{element.props.label}</div>}
        <div className={css.progressTrack}>
          <div className={css.progressFill} style={{ width: `${String(value)}%` }} />
        </div>
      </div>
    )
  },
  Table: ({ element }) => (
    <div className={css.tableWrap}>
      <table className={css.table}>
        <thead>
          <tr>{element.props.columns.map((column, i) => <th key={i}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {element.props.rows.map((row, r) => (
            <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
  LineChart: ({ element }) => {
    const { hostRef, tip, move, hide } = useTooltip()
    const [hoverIdx, setHoverIdx] = useState<number | null>(null)
    const points = element.props.points
    const unit = element.props.unit ?? ''
    const values = points.map(point => point.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min
    const first = points[0]
    const last = points[points.length - 1]
    // Crosshair: pointer x → nearest point index. The guide/dot overlay is
    // percentage-placed HTML, since circles inside the stretched viewBox
    // (preserveAspectRatio="none") would distort into ellipses. The top%
    // formula mirrors polylinePoints' y over the 0..32 viewBox with pad 2.
    const topPct = (value: number) => span === 0 ? 50 : ((30 - ((value - min) / span) * 28) / 32) * 100
    const leftPct = (index: number) => points.length === 1 ? 0 : (index / (points.length - 1)) * 100
    const onPlaneMove = (event: ReactMouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const frac = rect.width === 0 ? 0 : (event.clientX - rect.left) / rect.width
      const idx = Math.max(0, Math.min(points.length - 1, Math.round(frac * (points.length - 1))))
      const point = points[idx]
      if (point === undefined) return
      setHoverIdx(idx)
      move(event, [`${point.label}: ${String(point.value)}${unit}`])
    }
    const hoverPoint = hoverIdx === null ? undefined : points[hoverIdx]
    return (
      <div
        ref={hostRef}
        className={`${css.lineChart} ${css.tipHost}`}
        onMouseLeave={() => { hide(); setHoverIdx(null) }}
      >
        {element.props.title !== undefined && <div className={css.barChartTitle}>{element.props.title}</div>}
        <div className={css.lineGrid}>
          {/* The y range lives on the y edge: max top, min bottom. */}
          <div className={css.yAxis} data-axis="y">
            <span>
              {max}
              {unit}
            </span>
            <span>
              {min}
              {unit}
            </span>
          </div>
          <div className={css.linePlane} onMouseMove={onPlaneMove}>
            <svg className={css.lineChartSvg} viewBox="0 0 100 32" preserveAspectRatio="none" role="img">
              <polyline
                className={css.linePath}
                points={polylinePoints(values, 100, 32, 2)}
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {hoverIdx !== null && hoverPoint !== undefined && (
              <>
                <span className={css.lineGuide} style={{ left: `${leftPct(hoverIdx).toFixed(2)}%` }} />
                <span
                  className={css.lineDot}
                  style={{
                    left: `${leftPct(hoverIdx).toFixed(2)}%`,
                    top: `${topPct(hoverPoint.value).toFixed(2)}%`,
                    background: 'var(--dsw-alias-label-link, #4c7dff)',
                  }}
                />
              </>
            )}
          </div>
          <div className={css.lineMeta}>
            <span>{first?.label}</span>
            <span>{last?.label}</span>
          </div>
        </div>
        <Tooltip tip={tip} />
      </div>
    )
  },
  Sparkline: ({ element }) => (
    <span className={css.sparkline}>
      <svg className={css.sparklineSvg} viewBox="0 0 80 20" preserveAspectRatio="none" role="img">
        <polyline
          className={css.linePath}
          points={polylinePoints(element.props.values, 80, 20, 2)}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {element.props.label !== undefined && <span className={css.sparklineLabel}>{element.props.label}</span>}
    </span>
  ),
  BarChart: ({ element }) => {
    const { hostRef, tip, move, hide } = useTooltip()
    const unit = element.props.unit ?? ''
    const max = Math.max(...element.props.items.map(item => item.value), 1)
    return (
      <div ref={hostRef} className={`${css.barChart} ${css.tipHost}`} onMouseLeave={hide}>
        {element.props.title !== undefined && <div className={css.barChartTitle}>{element.props.title}</div>}
        {element.props.items.map((item, i) => (
          <div
            key={i}
            className={css.barRow}
            onMouseMove={(event) => { move(event, [`${item.label}: ${String(item.value)}${unit}`]) }}
          >
            <span className={css.barLabel}>{item.label}</span>
            <span className={css.barTrack}>
              <span className={css.barFill} style={{ width: `${String((item.value / max) * 100)}%` }} />
            </span>
            <span className={css.barValue}>
              {item.value}
              {unit}
            </span>
          </div>
        ))}
        <Tooltip tip={tip} />
      </div>
    )
  },
  ColumnChart: ({ element }) => {
    const { hostRef, tip, move, hide } = useTooltip()
    const items = element.props.items
    const unit = element.props.unit ?? ''
    const max = Math.max(...items.map(item => item.value), 1)
    return (
      <div ref={hostRef} className={`${css.columnChart} ${css.tipHost}`} onMouseLeave={hide}>
        {element.props.title !== undefined && <div className={css.barChartTitle}>{element.props.title}</div>}
        <div className={css.columnPlane}>
          {items.map((item, i) => (
            <div
              key={i}
              className={css.columnCell}
              data-cell={item.label}
              onMouseMove={(event) => { move(event, [`${item.label}: ${String(item.value)}${unit}`]) }}
            >
              <div className={css.columnValue}>
                {item.value}
                {unit}
              </div>
              {/* 88% ceiling leaves headroom for the value label above the
                  tallest column inside the fixed-height plane. */}
              <div className={css.columnBar} style={{ height: `${String((item.value / max) * 88)}%` }} />
            </div>
          ))}
        </div>
        <div className={css.columnLabels}>
          {items.map((item, i) => (
            <div key={i} className={css.columnLabel}>{item.label}</div>
          ))}
        </div>
        <Tooltip tip={tip} />
      </div>
    )
  },
  PieChart: ({ element }) => {
    const { hostRef, tip, move, hide } = useTooltip()
    const [hoverIdx, setHoverIdx] = useState<number | null>(null)
    const items = element.props.items
    const unit = element.props.unit ?? ''
    const total = items.reduce((sum, item) => sum + item.value, 0)
    const donut = element.props.donut ?? false
    // The stroke-dasharray slice technique: a pie is a circle whose stroke
    // reaches the center (width = 2r); a donut keeps a hole.
    const radius = donut ? 12 : 8
    const strokeWidth = donut ? 7 : 16
    const circumference = 2 * Math.PI * radius
    const visible = items.filter(item => item.value > 0)
    // ~2px surface gap between adjacent slices, skipped for a lone slice.
    const gap = visible.length > 1 ? 0.6 : 0
    const sliceOpacity = (index: number) => hoverIdx === null || hoverIdx === index ? 1 : 0.35
    let start = 0
    return (
      <div
        ref={hostRef}
        className={`${css.pieChart} ${css.chartPalette} ${css.tipHost}`}
        onMouseLeave={() => { hide(); setHoverIdx(null) }}
      >
        {element.props.title !== undefined && <div className={css.barChartTitle}>{element.props.title}</div>}
        <div className={css.pieBody}>
          <svg className={css.pieSvg} viewBox="0 0 32 32" role="img">
            <g transform="rotate(-90 16 16)">
              {total === 0 && (
                <circle className={css.pieEmptyTrack} cx="16" cy="16" r={radius} fill="none" strokeWidth={strokeWidth} />
              )}
              {items.map((item, i) => {
                if (item.value <= 0) return null
                const fraction = item.value / total
                const dash = Math.max(fraction * circumference - gap, 0.15)
                const offset = -start * circumference
                start += fraction
                return (
                  <circle
                    key={i}
                    className={css.pieSlice}
                    cx="16"
                    cy="16"
                    r={radius}
                    fill="none"
                    stroke={seriesColor(i)}
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${dash.toFixed(2)} ${circumference.toFixed(2)}`}
                    strokeDashoffset={offset.toFixed(2)}
                    style={{ opacity: sliceOpacity(i) }}
                    onMouseMove={(event) => {
                      setHoverIdx(i)
                      move(event, [`${item.label}: ${String(item.value)}${unit} (${String(Math.round(fraction * 100))}%)`])
                    }}
                  />
                )
              })}
            </g>
          </svg>
          {/* Slice colors sit below 3:1 on the light surface for some slots:
              the value-bearing legend is the mandated relief, not decoration.
              Hovering an entry highlights its slice, and vice versa. */}
          <div className={css.pieLegend} onMouseLeave={() => { setHoverIdx(null) }}>
            {items.map((item, i) => (
              <span
                key={i}
                className={css.legendEntry}
                data-active={hoverIdx === i ? 'true' : undefined}
                onMouseEnter={() => { setHoverIdx(i) }}
              >
                <span className={css.legendChip} style={{ background: seriesColor(i) }} />
                <span className={css.legendLabel}>{item.label}</span>
                <span className={css.legendValue}>
                  {item.value}
                  {unit}
                  {total > 0 ? ` (${String(Math.round((item.value / total) * 100))}%)` : ''}
                </span>
              </span>
            ))}
          </div>
        </div>
        <Tooltip tip={tip} />
      </div>
    )
  },
  MultiLineChart: ({ element }) => {
    const { hostRef, tip, move, hide } = useTooltip()
    const [hoverIdx, setHoverIdx] = useState<number | null>(null)
    const [hoverSeries, setHoverSeries] = useState<number | null>(null)
    const series = element.props.series
    const unit = element.props.unit ?? ''
    const all = series.flatMap(entry => entry.values)
    const min = Math.min(...all)
    const max = Math.max(...all)
    const span = max - min
    const xLabels = element.props.xLabels
    const maxLen = Math.max(...series.map(entry => entry.values.length))
    // Same crosshair geometry as LineChart; the index maps over the longest
    // series, shorter series clamp to their last point.
    const topPct = (value: number) => span === 0 ? 50 : ((30 - ((value - min) / span) * 28) / 32) * 100
    const onPlaneMove = (event: ReactMouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const frac = rect.width === 0 ? 0 : (event.clientX - rect.left) / rect.width
      const idx = Math.max(0, Math.min(maxLen - 1, Math.round(frac * (maxLen - 1))))
      setHoverIdx(idx)
      const lines = series.map((entry) => {
        const value = entry.values[Math.min(idx, entry.values.length - 1)]
        return `${entry.label}: ${String(value ?? '')}${unit}`
      })
      const head = xLabels?.[idx]
      move(event, head === undefined ? lines : [head, ...lines])
    }
    return (
      <div
        ref={hostRef}
        className={`${css.lineChart} ${css.chartPalette} ${css.tipHost}`}
        onMouseLeave={() => { hide(); setHoverIdx(null) }}
      >
        {element.props.title !== undefined && <div className={css.barChartTitle}>{element.props.title}</div>}
        <div className={css.lineGrid}>
          <div className={css.yAxis} data-axis="y">
            <span>
              {max}
              {unit}
            </span>
            <span>
              {min}
              {unit}
            </span>
          </div>
          <div className={css.linePlane} onMouseMove={onPlaneMove}>
            <svg className={css.lineChartSvg} viewBox="0 0 100 32" preserveAspectRatio="none" role="img">
              {series.map((entry, i) => (
                <polyline
                  key={i}
                  className={css.seriesLine}
                  style={{ stroke: seriesColor(i), opacity: hoverSeries === null || hoverSeries === i ? 1 : 0.25 }}
                  points={scaledPoints(entry.values, min, max, 100, 32, 2)}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
            {hoverIdx !== null && (
              <>
                <span
                  className={css.lineGuide}
                  style={{ left: `${String(maxLen === 1 ? 0 : (Math.min(hoverIdx, maxLen - 1) / (maxLen - 1)) * 100)}%` }}
                />
                {series.map((entry, i) => {
                  const si = Math.min(hoverIdx, entry.values.length - 1)
                  const value = entry.values[si]
                  if (value === undefined) return null
                  const left = entry.values.length === 1 ? 0 : (si / (entry.values.length - 1)) * 100
                  return (
                    <span
                      key={i}
                      className={css.lineDot}
                      style={{ left: `${left.toFixed(2)}%`, top: `${topPct(value).toFixed(2)}%`, background: seriesColor(i) }}
                    />
                  )
                })}
              </>
            )}
          </div>
          <div className={css.lineMeta}>
            <span>{xLabels?.[0]}</span>
            <span>{xLabels?.[xLabels.length - 1]}</span>
          </div>
        </div>
        {series.length > 1 && (
          <ChartLegend labels={series.map(entry => entry.label)} active={hoverSeries} onHover={setHoverSeries} />
        )}
        <Tooltip tip={tip} />
      </div>
    )
  },
  StackedBarChart: ({ element }) => {
    const { hostRef, tip, move, hide } = useTooltip()
    const [hoverSeries, setHoverSeries] = useState<number | null>(null)
    const names = element.props.series
    const unit = element.props.unit ?? ''
    const rows = element.props.rows.map(row => ({
      label: row.label,
      // Segments align positionally with the series names; extras are dropped.
      values: row.values.slice(0, names.length),
    }))
    const totals = rows.map(row => row.values.reduce((sum, value) => sum + value, 0))
    const maxTotal = Math.max(...totals, 1)
    return (
      <div
        ref={hostRef}
        className={`${css.barChart} ${css.chartPalette} ${css.tipHost}`}
        onMouseLeave={() => { hide(); setHoverSeries(null) }}
      >
        {element.props.title !== undefined && <div className={css.barChartTitle}>{element.props.title}</div>}
        {rows.map((row, r) => (
          <div key={r} className={css.barRow}>
            <span className={css.barLabel}>{row.label}</span>
            <span className={css.barTrack}>
              <span className={css.stackedSegments} style={{ width: `${String(((totals[r] ?? 0) / maxTotal) * 100)}%` }}>
                {row.values.map((value, i) => value > 0
                  ? (
                    <span
                      key={i}
                      className={css.stackedSegment}
                      data-series={names[i] ?? ''}
                      style={{
                        flexGrow: value,
                        background: seriesColor(i),
                        opacity: hoverSeries === null || hoverSeries === i ? 1 : 0.35,
                      }}
                      onMouseMove={(event) => {
                        setHoverSeries(i)
                        move(event, [row.label, `${names[i] ?? ''}: ${String(value)}${unit}`])
                      }}
                      onMouseLeave={() => { setHoverSeries(null) }}
                    />
                  )
                  : null)}
              </span>
            </span>
            <span className={css.barValue}>
              {totals[r]}
              {unit}
            </span>
          </div>
        ))}
        {names.length > 1 && <ChartLegend labels={names} active={hoverSeries} onHover={setHoverSeries} />}
        <Tooltip tip={tip} />
      </div>
    )
  },
  ScatterPlot: ({ element }) => {
    const { hostRef, tip, move, hide } = useTooltip()
    const [hoverSeries, setHoverSeries] = useState<number | null>(null)
    const series = element.props.series
    const xs = series.flatMap(entry => entry.points.map(point => point.x))
    const ys = series.flatMap(entry => entry.points.map(point => point.y))
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const spanX = maxX - minX
    const spanY = maxY - minY
    // Percentage placement over an HTML plane (not an SVG viewBox): markers
    // keep their designed pixel size at every card width, with no aspect
    // distortion. 4% padding keeps edge markers off the axis lines.
    const left = (x: number) => spanX === 0 ? 50 : 4 + ((x - minX) / spanX) * 92
    const top = (y: number) => spanY === 0 ? 50 : 96 - ((y - minY) / spanY) * 92
    return (
      <div
        ref={hostRef}
        className={`${css.scatterChart} ${css.chartPalette} ${css.tipHost}`}
        onMouseLeave={() => { hide(); setHoverSeries(null) }}
      >
        {element.props.title !== undefined && <div className={css.barChartTitle}>{element.props.title}</div>}
        <div className={css.lineGrid}>
          {/* Classic axis layout: y edge reads max / name / min top-down,
              the x edge below reads min / name / max left-right. */}
          <div className={`${css.yAxis} ${css.scatterYAxis}`} data-axis="y">
            <span>{maxY}</span>
            <span>{element.props.yLabel ?? 'y'}</span>
            <span>{minY}</span>
          </div>
          <div className={css.scatterPlane}>
            {series.map((entry, i) => entry.points.map((point, p) => (
              <span
                key={`${String(i)}-${String(p)}`}
                className={css.scatterDot}
                data-series={entry.label}
                style={{
                  left: `${left(point.x).toFixed(2)}%`,
                  top: `${top(point.y).toFixed(2)}%`,
                  background: seriesColor(i),
                  opacity: hoverSeries === null || hoverSeries === i ? 1 : 0.3,
                }}
                onMouseMove={(event) => { move(event, [`${entry.label}: (${String(point.x)}, ${String(point.y)})`]) }}
              />
            )))}
          </div>
          <div className={css.lineMeta} data-axis="x">
            <span>{minX}</span>
            <span>{element.props.xLabel ?? 'x'}</span>
            <span>{maxX}</span>
          </div>
        </div>
        {series.length > 1 && (
          <ChartLegend labels={series.map(entry => entry.label)} active={hoverSeries} onHover={setHoverSeries} />
        )}
        <Tooltip tip={tip} />
      </div>
    )
  },
})
