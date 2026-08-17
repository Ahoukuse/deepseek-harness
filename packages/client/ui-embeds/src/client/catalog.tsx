/**
 * The v1 widget catalog: dashboard / data-visualization vocabulary. The
 * catalog is the security and expressiveness boundary of `show_ui` — the
 * model can only reference components declared here, with zod-validated
 * props, and v1 deliberately declares NO actions, so a widget cannot trigger
 * side effects. The host tool's system-prompt guidance enumerates this same
 * vocabulary; the two MUST evolve together.
 */
import { defineCatalog } from '@json-render/core'
import { schema } from '@json-render/react/schema'
import { createRenderer } from '@json-render/react'
import { z } from 'zod'
import css from './widgets.module.css'

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
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  return values.map((value, i) => {
    const x = values.length === 1 ? 0 : (i / (values.length - 1)) * width
    const y = span === 0 ? height / 2 : height - pad - ((value - min) / span) * (height - 2 * pad)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
}

export const catalog = defineCatalog(schema, {
  components: {
    Stack: {
      props: z.object({
        direction: z.enum(['row', 'column']).optional(),
        gap: z.number().min(0).max(48).optional(),
      }),
      slots: ['default'],
    },
    Grid: {
      props: z.object({ columns: z.number().int().min(1).max(6) }),
      slots: ['default'],
    },
    Card: {
      props: z.object({ title: z.string().optional() }),
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
      style={{ gap: element.props.gap ?? 8 }}
    >
      {children}
    </div>
  ),
  Grid: ({ element, children }) => (
    <div className={css.grid} style={{ gridTemplateColumns: `repeat(${String(element.props.columns)}, minmax(0, 1fr))` }}>
      {children}
    </div>
  ),
  Card: ({ element, children }) => (
    <div className={css.card}>
      {element.props.title !== undefined && <div className={css.cardTitle}>{element.props.title}</div>}
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
    const points = element.props.points
    const values = points.map(point => point.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const first = points[0]
    const last = points[points.length - 1]
    return (
      <div className={css.lineChart}>
        {element.props.title !== undefined && <div className={css.barChartTitle}>{element.props.title}</div>}
        <svg className={css.lineChartSvg} viewBox="0 0 100 32" preserveAspectRatio="none" role="img">
          <polyline
            className={css.linePath}
            points={polylinePoints(values, 100, 32, 2)}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className={css.lineMeta}>
          <span>{first?.label}</span>
          <span className={css.lineRange}>
            {min}
            –
            {max}
            {element.props.unit ?? ''}
          </span>
          <span>{last?.label}</span>
        </div>
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
    const max = Math.max(...element.props.items.map(item => item.value), 1)
    return (
      <div className={css.barChart}>
        {element.props.title !== undefined && <div className={css.barChartTitle}>{element.props.title}</div>}
        {element.props.items.map((item, i) => (
          <div key={i} className={css.barRow}>
            <span className={css.barLabel}>{item.label}</span>
            <span className={css.barTrack}>
              <span className={css.barFill} style={{ width: `${String((item.value / max) * 100)}%` }} />
            </span>
            <span className={css.barValue}>
              {item.value}
              {element.props.unit ?? ''}
            </span>
          </div>
        ))}
      </div>
    )
  },
})
