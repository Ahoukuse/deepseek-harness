/**
 * show_ui spec playground: JSON on the left, the live catalog rendering on
 * the right. Dev-only; imports the real WidgetRenderer + widgets.module.css
 * plus ui-theme's token sheet, so what renders here is what renders in chat
 * (minus the embed-resolution pipeline).
 */
import type { ComponentProps, ReactNode } from 'react'
import { Component, StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { WidgetRenderer } from '../src/client/catalog.tsx'
import '../../ui-theme/src/styles/design-platform.css'
import './playground.css'

type Spec = ComponentProps<typeof WidgetRenderer>['spec']

const PRESETS: { name: string; spec: unknown }[] = [
  {
    name: 'KPI 仪表盘',
    spec: {
      root: 'card',
      elements: {
        card: { type: 'Card', props: { title: 'Q3 overview', subtitle: 'refreshed 5 min ago' }, children: ['grid', 'cols'] },
        grid: { type: 'Grid', props: { columns: 3 }, children: ['m1', 'm2', 'm3'] },
        m1: { type: 'Metric', props: { label: 'Revenue', value: '4.2M', unit: 'USD', delta: '+8%', trend: 'up' }, children: [] },
        m2: { type: 'Metric', props: { label: 'Orders', value: '12.4k', delta: '+3%', trend: 'up' }, children: [] },
        m3: { type: 'Metric', props: { label: 'Churn', value: '2.1%', delta: '-0.3pt', trend: 'down' }, children: [] },
        cols: { type: 'ColumnChart', props: { title: 'Monthly revenue', items: [{ label: 'Jul', value: 1.3 }, { label: 'Aug', value: 1.4 }, { label: 'Sep', value: 1.5 }], unit: 'M' }, children: [] },
      },
    },
  },
  {
    name: '构成视图',
    spec: {
      root: 'row',
      elements: {
        row: { type: 'Stack', props: { direction: 'row', gap: 12 }, children: ['pieCard', 'stackCard'] },
        pieCard: { type: 'Card', props: { title: 'Traffic sources' }, children: ['pie'] },
        pie: { type: 'PieChart', props: { items: [{ label: 'Search', value: 54 }, { label: 'Direct', value: 28 }, { label: 'Referral', value: 18 }], donut: true, unit: '%' }, children: [] },
        stackCard: { type: 'Card', props: { title: 'By region' }, children: ['stack'] },
        stack: { type: 'StackedBarChart', props: { series: ['Search', 'Direct', 'Referral'], rows: [{ label: 'EU', values: [30, 12, 8] }, { label: 'US', values: [24, 16, 10] }], unit: 'k' }, children: [] },
      },
    },
  },
  {
    name: '图表总览',
    spec: {
      root: 'grid',
      elements: {
        grid: { type: 'Grid', props: { columns: 2 }, children: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] },
        c1: { type: 'Card', props: { title: 'BarChart' }, children: ['bar'] },
        bar: { type: 'BarChart', props: { items: [{ label: 'Alpha', value: 34 }, { label: 'Beta', value: 21 }, { label: 'Gamma', value: 13 }], unit: 'k' }, children: [] },
        c2: { type: 'Card', props: { title: 'LineChart' }, children: ['line'] },
        line: { type: 'LineChart', props: { points: [{ label: 'Mon', value: 12 }, { label: 'Tue', value: 18 }, { label: 'Wed', value: 9 }, { label: 'Thu', value: 24 }, { label: 'Fri', value: 20 }], unit: 'k' }, children: [] },
        c3: { type: 'Card', props: { title: 'MultiLineChart' }, children: ['multi'] },
        multi: { type: 'MultiLineChart', props: { series: [{ label: 'p50', values: [40, 42, 45, 41] }, { label: 'p95', values: [90, 110, 95, 120] }], xLabels: ['W1', 'W2', 'W3', 'W4'], unit: 'ms' }, children: [] },
        c4: { type: 'Card', props: { title: 'PieChart' }, children: ['pie'] },
        pie: { type: 'PieChart', props: { items: [{ label: 'A', value: 5 }, { label: 'B', value: 3 }, { label: 'C', value: 2 }] }, children: [] },
        c5: { type: 'Card', props: { title: 'ScatterPlot' }, children: ['scatter'] },
        scatter: { type: 'ScatterPlot', props: { series: [{ label: 's1', points: [{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 3 }] }, { label: 's2', points: [{ x: 1.5, y: 5 }, { x: 2.5, y: 1 }] }], xLabel: 'x', yLabel: 'y' }, children: [] },
        c6: { type: 'Card', props: { title: 'Misc' }, children: ['prog', 'spark', 'badges'] },
        prog: { type: 'Progress', props: { label: 'Rollout', value: 62 }, children: [] },
        spark: { type: 'Sparkline', props: { values: [1, 5, 2, 8, 4, 9], label: 'wk' }, children: [] },
        badges: { type: 'Stack', props: { direction: 'row', gap: 6 }, children: ['b1', 'b2', 'b3'] },
        b1: { type: 'Badge', props: { label: 'ok', tone: 'success' }, children: [] },
        b2: { type: 'Badge', props: { label: 'warn', tone: 'warning' }, children: [] },
        b3: { type: 'Badge', props: { label: 'down', tone: 'danger' }, children: [] },
      },
    },
  },
  {
    name: '布局演示',
    spec: {
      root: 'grid',
      elements: {
        grid: { type: 'Grid', props: { columns: 3, spans: [3, 2, 1] }, children: ['header', 'main', 'side'] },
        header: { type: 'Card', props: { dense: true }, children: ['headRow'] },
        headRow: { type: 'Stack', props: { direction: 'row', justify: 'between', align: 'center' }, children: ['headTitle', 'headBadge'] },
        headTitle: { type: 'Text', props: { content: 'Deployment status', variant: 'title' }, children: [] },
        headBadge: { type: 'Badge', props: { label: 'live', tone: 'success' }, children: [] },
        main: { type: 'Card', props: { title: 'Main (span 2)' }, children: ['table'] },
        table: { type: 'Table', props: { columns: ['Service', 'Version', 'State'], rows: [['api', '1.4.2', 'healthy'], ['worker', '1.4.2', 'healthy'], ['edge', '1.4.1', 'rolling']] }, children: [] },
        side: { type: 'Card', props: { title: 'Side (span 1)', subtitle: 'dense grid cell' }, children: ['sideStack'] },
        sideStack: { type: 'Stack', props: { gap: 10 }, children: ['sm1', 'sp'] },
        sm1: { type: 'Metric', props: { label: 'Uptime', value: '99.98', unit: '%' }, children: [] },
        sp: { type: 'Progress', props: { label: 'Canary', value: 35 }, children: [] },
      },
    },
  },
]

/** Keeps a spec-thrown error contained to the preview pane; reset by key. */
class Boundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null }
  static getDerivedStateFromError(error: unknown) {
    return { error: String(error) }
  }
  render() {
    if (this.state.error !== null) return <div className="pg-error">渲染失败: {this.state.error}</div>
    return this.props.children
  }
}

function App() {
  const [text, setText] = useState(() => JSON.stringify(PRESETS[0]?.spec, null, 2))
  const [dark, setDark] = useState(false)
  const parsed = useMemo(() => {
    try {
      return { spec: JSON.parse(text) as Spec, error: null as string | null }
    } catch (error) {
      return { spec: null, error: String(error) }
    }
  }, [text])
  // The preview holds the last parseable spec, so mid-edit states keep
  // showing something instead of flashing empty.
  const [spec, setSpec] = useState<Spec | null>(null)
  useEffect(() => {
    if (parsed.spec !== null) setSpec(parsed.spec)
  }, [parsed])
  useEffect(() => {
    document.body.toggleAttribute('data-ds-dark-theme', dark)
  }, [dark])
  const elementCount = spec === null ? 0 : Object.keys((spec as { elements?: Record<string, unknown> }).elements ?? {}).length
  return (
    <div className="pg-root">
      <header className="pg-toolbar">
        <strong>show_ui playground</strong>
        <select
          onChange={(event) => {
            const preset = PRESETS.find(entry => entry.name === event.target.value)
            if (preset) setText(JSON.stringify(preset.spec, null, 2))
          }}
          defaultValue={PRESETS[0]?.name}
        >
          {PRESETS.map(preset => <option key={preset.name} value={preset.name}>{preset.name}</option>)}
        </select>
        <button type="button" onClick={() => { setDark(value => !value) }}>
          {dark ? '☀ 亮色' : '☾ 暗色'}
        </button>
        <span className={parsed.error === null ? 'pg-status' : 'pg-status pg-status-error'}>
          {parsed.error ?? `${String(elementCount)} elements`}
        </span>
      </header>
      <main className="pg-main">
        <textarea
          className="pg-editor"
          value={text}
          onChange={(event) => { setText(event.target.value) }}
          spellCheck={false}
        />
        <div className="pg-preview">
          <div className="pg-bubble">
            {spec !== null && (
              <Boundary key={JSON.stringify(spec)}>
                <WidgetRenderer spec={spec} />
              </Boundary>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

const rootElement = document.getElementById('root')
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
