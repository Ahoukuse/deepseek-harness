// @vitest-environment jsdom
// The svg render intent on the web side: the pure svgCardModel derivation over
// a settled call's persisted arguments (with its wire-boundary guards), the
// SvgRow composing the shared ToolRow with the graphic collapsed by default,
// and the GenericToolCard fallback carrying the same card.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { RunningToolCall, ToolResultNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { zh } from '@deepseek-ai/dsh-client-ui-conversation/src/client/locales.ts'
import { svgCardModel } from '../src/client/tool/models/svg-card-model.ts'
import { GenericToolCard, type GenericToolCardProps } from '../src/client/tool/toolviews/GenericToolCard.tsx'
import { SvgRow } from '../src/client/tool/toolviews/svg-row.tsx'

afterEach(cleanup)

/** Conversation-locale translate stub for the render sites' `t` seat. */
const t: GenericToolCardProps['t'] = makeTranslate(zh, commonZh)

const SVG = '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></svg>'
const ARGS = JSON.stringify({ svg: SVG, title: 'A circle' })

/** A show_svg call head carrying the given raw arguments. */
const callHead = (args: unknown, name = 'show_svg') => ({ name, argsRaw: JSON.stringify(args) })

const runningCall = (over?: Partial<RunningToolCall>): RunningToolCall => ({
  callId: 'c1', name: 'show_svg', argsRaw: ARGS,
  turn: 1, step: 1, time: 1_000, subCalls: [], ...over,
})

const settledCall = (over?: Partial<ToolResultNode>): ToolResultNode => ({
  kind: 'tool-result', seq: 10, time: 2_000, callId: 'c1',
  call: { name: 'show_svg', argsRaw: ARGS },
  callTime: 1_000,
  content: [{ type: 'text', text: 'Displayed the SVG graphic (A circle, 98 characters) to the user.' }], isError: false,
  subCalls: [], ...over,
})

describe('svgCardModel', () => {
  it('derives the card and replacement title from the settled call arguments', () => {
    expect(svgCardModel(settledCall())).toEqual({ title: 'A circle', card: { svg: SVG } })
    expect(svgCardModel(settledCall({ call: callHead({ svg: SVG }) }))).toEqual({ card: { svg: SVG } })
  })

  it('returns null for every non-svg call: running, failed, foreign, headless', () => {
    // The svg card is result-time only: a running call has not settled yet.
    expect(svgCardModel(runningCall())).toBeNull()
    // A failed call never derives a card from its arguments.
    expect(svgCardModel(settledCall({ isError: true }))).toBeNull()
    // Name-gated: a foreign call's arguments are never parsed.
    expect(svgCardModel(settledCall({ call: callHead({ svg: SVG }, 'other_tool') }))).toBeNull()
    // Window truncation can leave the call head outside the snapshot.
    expect(svgCardModel(settledCall({ call: null }))).toBeNull()
  })

  it('returns null when the persisted markup is missing, blank, or unparsable', () => {
    expect(svgCardModel(settledCall({ call: callHead({ title: 'x' }) }))).toBeNull()
    expect(svgCardModel(settledCall({ call: callHead({ svg: '' }) }))).toBeNull()
    expect(svgCardModel(settledCall({ call: { name: 'show_svg', argsRaw: '{ not json' } }))).toBeNull()
  })
})

/** The whole summary row is the expand toggle (ToolRow's unified interaction). */
const toggleRow = (view: { container: HTMLElement }) => {
  fireEvent.click(view.container.querySelector('[data-expandable]')!)
}

describe('SvgRow', () => {
  const rowProps = (block: RunningToolCall | ToolResultNode) => ({
    callId: 'c1', toolName: 'show_svg', block, openFile: vi.fn(), t,
  })

  it('collapsed receipt row: the title line, no graphic mounted yet', () => {
    const view = render(<SvgRow {...rowProps(settledCall()) as Parameters<typeof SvgRow>[0]} />)
    expect(view.container.textContent).toContain('SVG')
    expect(view.container.textContent).toContain('A circle')
    // The leading icon is itself an inline svg; the card container is the
    // signal that the graphic body mounted.
    expect(view.container.querySelector('[data-svg]')).toBeNull()
  })

  it('expanded: the sanitized graphic renders in the card body', () => {
    const view = render(<SvgRow {...rowProps(settledCall()) as Parameters<typeof SvgRow>[0]} />)
    toggleRow(view)
    const graphic = view.container.querySelector('[data-svg="graphic"]')
    expect(graphic).not.toBeNull()
    expect(graphic?.querySelector('circle')).not.toBeNull()
  })

  it('running: the summary line alone, no card', () => {
    const view = render(<SvgRow {...rowProps(runningCall()) as Parameters<typeof SvgRow>[0]} />)
    expect(view.container.querySelector('[data-svg]')).toBeNull()
  })
})

describe('chat row svg body (GenericToolCard fallback)', () => {
  const ownerProps = (block: RunningToolCall | ToolResultNode): GenericToolCardProps => ({
    callId: 'c1', toolName: 'show_svg', block, openFile: vi.fn(), t,
  })

  it('the expanded fallback body is the same sanitized graphic', () => {
    const view = render(<GenericToolCard {...ownerProps(settledCall())} />)
    expect(view.container.querySelector('[data-svg]')).toBeNull()
    toggleRow(view)
    expect(view.container.querySelector('[data-svg="graphic"]')?.querySelector('circle')).not.toBeNull()
  })
})
