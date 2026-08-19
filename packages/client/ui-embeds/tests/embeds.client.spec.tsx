// @vitest-environment jsdom
// The two embed renderers over a stubbed session kit: dsh-svg resolves a
// settled show_svg call (view or arguments) into the sanitized graphic,
// dsh-ui resolves a settled show_ui call into the catalog renderer, and both
// degrade to the raw reference line when the id resolves to nothing. The
// widget boundary contains a catalog-invalid spec.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ChatNodeStore, ChatSnapshot, ToolResultNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import { SvgEmbed, UiEmbed } from '../src/client/embeds.tsx'

afterEach(cleanup)

const SVG = '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></svg>'
const UI_SPEC = {
  root: 'card',
  elements: {
    card: { type: 'Card', props: { title: 'KPIs' }, children: ['m1', 'bar'] },
    m1: { type: 'Metric', props: { label: 'Revenue', value: '1.2M', unit: 'USD' }, children: [] },
    bar: { type: 'BarChart', props: { items: [{ label: 'Q1', value: 10 }, { label: 'Q2', value: 20 }] }, children: [] },
  },
}

/** A settled call node wrapped as the store's one tool node. */
function storeWith(name: string, args: Record<string, unknown>, callId = 'c1'): ChatNodeStore {
  const block: ToolResultNode = {
    kind: 'tool-result', seq: 1, time: 1, callId,
    call: { name, argsRaw: JSON.stringify(args) },
    callTime: 0, content: [], isError: false, subCalls: [],
  }
  const node = { kind: 'tool-call', key: 'n1', data: { root: block } }
  return { get: () => node, values: () => [node] } as unknown as ChatNodeStore
}

/** Minimal embed props over a stubbed session kit. */
function embedProps(nodes: ChatNodeStore, id: string) {
  const useChat = (selector: (s: ChatSnapshot) => unknown) =>
    selector({ nodes } as unknown as ChatSnapshot)
  return {
    scheme: 'dsh-svg', id, alt: 'alt', raw: `![alt](dsh-svg://${id})`,
    useChat, sessionId: 's1' as SessionId, useProjection: vi.fn(),
  } as unknown as Parameters<typeof SvgEmbed>[0]
}

describe('SvgEmbed', () => {
  it('renders the referenced graphic from persisted arguments', () => {
    const view = render(<SvgEmbed {...embedProps(storeWith('show_svg', { svg: SVG }), 'c1')} />)
    expect(view.container.querySelector('[data-svg="graphic"]')?.querySelector('circle')).not.toBeNull()
  })

  it('degrades to the raw line when the id resolves to nothing', () => {
    const view = render(<SvgEmbed {...embedProps(storeWith('show_svg', { svg: SVG }), 'missing')} />)
    expect(view.container.querySelector('[data-svg]')).toBeNull()
    expect(view.container.textContent).toContain('alt')
  })
})

describe('UiEmbed', () => {
  it('renders the referenced widget through the catalog renderer', () => {
    const view = render(<UiEmbed {...embedProps(storeWith('show_ui', { spec: UI_SPEC }), 'c1')} />)
    const root = view.container.querySelector('[data-embed="ui"]')
    expect(root).not.toBeNull()
    expect(root?.textContent).toContain('KPIs')
    expect(root?.textContent).toContain('Revenue')
    expect(root?.textContent).toContain('Q2')
  })

  it('renders LineChart and Sparkline as inline SVG polylines', () => {
    const spec = {
      root: 'stack',
      elements: {
        stack: { type: 'Stack', props: {}, children: ['line', 'spark'] },
        line: { type: 'LineChart', props: { title: 'Trend', points: [{ label: 'Jan', value: 1 }, { label: 'Feb', value: 3 }, { label: 'Mar', value: 2 }], unit: 'k' }, children: [] },
        spark: { type: 'Sparkline', props: { values: [1, 5, 2, 8], label: 'wk' }, children: [] },
      },
    }
    const view = render(<UiEmbed {...embedProps(storeWith('show_ui', { spec }), 'c1')} />)
    const polylines = view.container.querySelectorAll('polyline')
    expect(polylines).toHaveLength(2)
    // Normalized geometry: every y stays inside the LineChart viewBox band.
    const ys = (polylines[0]?.getAttribute('points') ?? '').split(' ').map(pair => Number(pair.split(',')[1]))
    expect(ys.every(y => y >= 2 && y <= 30)).toBe(true)
    expect(view.container.textContent).toContain('Jan')
    // The y range sits on the y edge: max on top, min at the bottom.
    expect(view.container.querySelector('[data-axis="y"]')?.textContent).toBe('3k1k')
    expect(view.container.textContent).toContain('wk')
  })

  it('renders the four multi-series chart types with slot-ordered palette colors', () => {
    const spec = {
      root: 'stack',
      elements: {
        stack: { type: 'Stack', props: {}, children: ['pie', 'lines', 'stacked', 'scatter'] },
        pie: { type: 'PieChart', props: { title: 'Share', items: [{ label: 'A', value: 3 }, { label: 'B', value: 1 }], unit: 'k' }, children: [] },
        lines: { type: 'MultiLineChart', props: { series: [{ label: 's1', values: [1, 2] }, { label: 's2', values: [3, 1] }], xLabels: ['Jan', 'Feb'] }, children: [] },
        stacked: { type: 'StackedBarChart', props: { series: ['x', 'y'], rows: [{ label: 'r1', values: [2, 3] }] }, children: [] },
        scatter: { type: 'ScatterPlot', props: { series: [{ label: 'pts', points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }], xLabel: 'w' }, children: [] },
      },
    }
    const view = render(<UiEmbed {...embedProps(storeWith('show_ui', { spec }), 'c1')} />)
    // Pie: one slice circle per positive item, plus the value-bearing legend
    // (the relief for low-contrast light slots), share percentages included.
    const slices = view.container.querySelectorAll('circle[stroke-dasharray]')
    expect(slices).toHaveLength(2)
    expect(view.container.textContent).toContain('75%')
    // Colors are slot-ordered (fixed assignment, never cycled).
    expect(slices[0]?.getAttribute('stroke')).toBe('var(--dsh-cat-1)')
    expect(slices[1]?.getAttribute('stroke')).toBe('var(--dsh-cat-2)')
    // Multi-line: one polyline per series on a shared scale, legend present,
    // shared y range on the left edge (max over min).
    const polylines = view.container.querySelectorAll('polyline')
    expect(polylines).toHaveLength(2)
    const yAxes = view.container.querySelectorAll('[data-axis="y"]')
    expect(yAxes[0]?.textContent).toBe('31')
    expect(view.container.textContent).toContain('s2')
    // Stacked: one segment per positive value and the row total.
    expect(view.container.querySelectorAll('[data-series="x"], [data-series="y"]')).toHaveLength(2)
    expect(view.container.textContent).toContain('r1')
    // Scatter: one dot per point; a single series ships no legend box. Axes
    // read max/name/min down the y edge and min/name/max along the x edge.
    expect(view.container.querySelectorAll('[data-series="pts"]')).toHaveLength(2)
    const scatterY = view.container.querySelectorAll('[data-axis="y"]')[1]
    expect(scatterY?.textContent).toBe('4y2')
    expect(view.container.querySelector('[data-axis="x"]')?.textContent).toBe('1w3')
  })

  it('renders ColumnChart as vertical bars with centered labels and values', () => {
    const spec = {
      root: 'cols',
      elements: {
        cols: { type: 'ColumnChart', props: { title: 'Monthly', items: [{ label: 'Jan', value: 4 }, { label: 'Feb', value: 8 }, { label: 'Mar', value: 2 }], unit: 'k' }, children: [] },
      },
    }
    const view = render(<UiEmbed {...embedProps(storeWith('show_ui', { spec }), 'c1')} />)
    const cells = view.container.querySelectorAll('[data-cell]')
    expect(cells).toHaveLength(3)
    // Heights scale to the max value under the 88% label-headroom ceiling.
    const bars = Array.from(view.container.querySelectorAll<HTMLElement>('[data-cell] > :last-child'))
    expect(bars.map(bar => bar.style.height)).toEqual(['44%', '88%', '22%'])
    expect(view.container.textContent).toContain('Feb')
    expect(view.container.textContent).toContain('8k')
  })

  it('applies layout props: Stack alignment, Grid spans, Card subtitle and density', () => {
    const spec = {
      root: 'stack',
      elements: {
        stack: { type: 'Stack', props: { direction: 'row', justify: 'between', align: 'center', wrap: false }, children: ['card', 'grid'] },
        card: { type: 'Card', props: { title: 'T', subtitle: 'context line', dense: true }, children: [] },
        grid: { type: 'Grid', props: { columns: 3, spans: [2, 1] }, children: ['a', 'b'] },
        a: { type: 'Text', props: { content: 'main' }, children: [] },
        b: { type: 'Text', props: { content: 'side' }, children: [] },
      },
    }
    const view = render(<UiEmbed {...embedProps(storeWith('show_ui', { spec }), 'c1')} />)
    const stack = view.container.querySelector<HTMLElement>('[data-direction="row"]')
    expect(stack?.style.justifyContent).toBe('space-between')
    expect(stack?.style.alignItems).toBe('center')
    expect(stack?.style.flexWrap).toBe('nowrap')
    const dense = view.container.querySelector('[data-dense="true"]')
    expect(dense?.textContent).toContain('context line')
    // Positional spans wrap each grid child; span values clamp to `columns`.
    const spanned = Array.from(view.container.querySelectorAll<HTMLElement>('[style*="grid-column"]'))
    expect(spanned.map(el => el.style.gridColumn)).toEqual(['span 2', 'span 1'])
    expect(spanned[0]?.textContent).toBe('main')
  })

  it('shows pointer tooltips and hover emphasis on charts', () => {
    const spec = {
      root: 'stack',
      elements: {
        stack: { type: 'Stack', props: {}, children: ['cols', 'line', 'pie'] },
        cols: { type: 'ColumnChart', props: { items: [{ label: 'Jan', value: 4 }, { label: 'Feb', value: 8 }], unit: 'k' }, children: [] },
        line: { type: 'LineChart', props: { points: [{ label: 'Mon', value: 1 }, { label: 'Tue', value: 3 }], unit: 'x' }, children: [] },
        pie: { type: 'PieChart', props: { items: [{ label: 'A', value: 3 }, { label: 'B', value: 1 }], unit: 'k' }, children: [] },
      },
    }
    const view = render(<UiEmbed {...embedProps(storeWith('show_ui', { spec }), 'c1')} />)
    expect(view.container.querySelector('[role="status"]')).toBeNull()
    // Column: hovering a cell raises the tooltip; leaving the chart clears it.
    const cell = view.container.querySelector<HTMLElement>('[data-cell="Feb"]')
    expect(cell).not.toBeNull()
    if (!cell) return
    fireEvent.mouseMove(cell, { clientX: 40, clientY: 12 })
    expect(view.container.querySelector('[role="status"]')?.textContent).toBe('Feb: 8k')
    const chartRoot = cell.parentElement?.parentElement
    if (chartRoot) fireEvent.mouseLeave(chartRoot)
    expect(view.container.querySelector('[role="status"]')).toBeNull()
    // Line: moving over the plane snaps the crosshair to the nearest point
    // (jsdom rects are zero-width, so the index resolves to 0) and renders
    // the guide plus marker dot as overlay spans.
    const plane = view.container.querySelector('polyline')?.closest('svg')?.parentElement
    expect(plane).not.toBeNull()
    if (!plane) return
    fireEvent.mouseMove(plane, { clientX: 10, clientY: 10 })
    expect(view.container.querySelector('[role="status"]')?.textContent).toBe('Mon: 1x')
    expect(plane.querySelectorAll('span')).toHaveLength(2)
    // Pie: hovering one slice dims the others and reports value + share.
    const slices = view.container.querySelectorAll<SVGCircleElement>('circle[stroke-dasharray]')
    expect(slices).toHaveLength(2)
    fireEvent.mouseMove(slices[0] as SVGCircleElement, { clientX: 5, clientY: 5 })
    expect((slices[1] as SVGCircleElement).style.opacity).toBe('0.35')
    expect(view.container.textContent).toContain('A: 3k (75%)')
  })

  it('contains a catalog-invalid spec instead of unmounting', () => {
    const bad = { root: 'x', elements: { x: { type: 'NotAComponent', props: {}, children: [] } } }
    const view = render(<UiEmbed {...embedProps(storeWith('show_ui', { spec: bad }), 'c1')} />)
    // Either the renderer skips the unknown type or the boundary catches a
    // throw; both keep the surrounding tree alive.
    expect(view.container.querySelector('[data-embed="ui"]')).not.toBeNull()
  })
})
