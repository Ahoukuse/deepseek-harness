// @vitest-environment jsdom
// The two embed renderers over a stubbed session kit: dsh-svg resolves a
// settled show_svg call (view or arguments) into the sanitized graphic,
// dsh-ui resolves a settled show_ui call into the catalog renderer, and both
// degrade to the raw reference line when the id resolves to nothing. The
// widget boundary contains a catalog-invalid spec.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
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
    expect(view.container.textContent).toContain('1–3k')
    expect(view.container.textContent).toContain('wk')
  })

  it('contains a catalog-invalid spec instead of unmounting', () => {
    const bad = { root: 'x', elements: { x: { type: 'NotAComponent', props: {}, children: [] } } }
    const view = render(<UiEmbed {...embedProps(storeWith('show_ui', { spec: bad }), 'c1')} />)
    // Either the renderer skips the unknown type or the boundary catches a
    // throw; both keep the surrounding tree alive.
    expect(view.container.querySelector('[data-embed="ui"]')).not.toBeNull()
  })
})
