import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import * as ToolShowUi from '@deepseek-ai/dsh-tool-show-ui'
import { DEFAULT_MAX_SPEC_CHARS, parseShowUiArgs } from '@deepseek-ai/dsh-tool-show-ui'

const testToolSignal = new AbortController().signal

const SPEC = {
  root: 'card',
  elements: {
    card: { type: 'Card', props: { title: 'KPIs' }, children: ['m1'] },
    m1: { type: 'Metric', props: { label: 'Revenue', value: '1.2M' }, children: [] },
  },
}

/** Mount the real registry and tool-show-ui; return an executor helper. */
async function mountTools(config: ToolShowUi.Config = {}): Promise<{ call: (args: unknown) => Promise<ToolExecutionResult> }> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(ToolShowUi, config)
  let counter = 0
  const call = (args: unknown) => ctx.tools.execute({ signal: testToolSignal, callId: CallId(`call-${++counter}`), name: 'show_ui', arguments: args })
  return { call }
}

describe('argument validation', () => {
  it('accepts a flat-tree spec and rejects malformed shapes', () => {
    expect(parseShowUiArgs({ spec: SPEC }, DEFAULT_MAX_SPEC_CHARS).spec).toBe(SPEC)
    expect(() => parseShowUiArgs({ spec: { elements: {} } }, DEFAULT_MAX_SPEC_CHARS)).toThrow('spec.root')
    expect(() => parseShowUiArgs({ spec: { root: 'x' } }, DEFAULT_MAX_SPEC_CHARS)).toThrow('spec.elements')
    expect(() => parseShowUiArgs({ spec: { root: 'x', elements: {} } }, DEFAULT_MAX_SPEC_CHARS)).toThrow('missing the root')
    expect(() => parseShowUiArgs({ spec: { root: 'x', elements: { x: { props: {} } } } }, DEFAULT_MAX_SPEC_CHARS)).toThrow('string "type"')
    expect(() => parseShowUiArgs({ spec: SPEC }, 10)).toThrow('limit is 10')
  })
})

describe('execution through the registry', () => {
  it('returns the call id as the reference id and renders the placement instruction', async () => {
    const { call } = await mountTools()
    const result = await call({ spec: SPEC, title: 'KPI Dashboard' })
    expect(result.isError).toBe(false)
    expect(result.value).toEqual({ uiId: 'call-1', chars: JSON.stringify(SPEC).length })
    const text = result.content.map(block => block.type === 'text' ? block.text : '').join('')
    expect(text).toContain('![KPI Dashboard](dsh-ui://call-1)')
  })

  it('fails a malformed spec with an actionable message', async () => {
    const { call } = await mountTools()
    const result = await call({ spec: { root: 'x', elements: {} } })
    expect(result.isError).toBe(true)
  })
})
