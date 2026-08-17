import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { ToolResult } from '@deepseek-ai/dsh-tools'
import * as ToolShowSvg from '@deepseek-ai/dsh-tool-show-svg'
import {
  DEFAULT_MAX_SVG_CHARS,
  parseShowSvgArgs,
  presentShowSvgCall,
  presentShowSvgResult,
} from '@deepseek-ai/dsh-tool-show-svg'

const testToolSignal = new AbortController().signal

const SVG = '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></svg>'

/** Mount the real registry and tool-show-svg; return an executor helper. */
async function mountTools(
  config: ToolShowSvg.Config = {},
): Promise<{ ctx: Context; call: (args: unknown) => Promise<ToolExecutionResult> }> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(ToolShowSvg, config)
  let counter = 0
  const call = (args: unknown) => ctx.tools.execute({ signal: testToolSignal, callId: CallId(`call-${++counter}`), name: 'show_svg', arguments: args })
  return { ctx, call }
}

describe('argument validation', () => {
  it('accepts a complete svg document, with or without an XML declaration', () => {
    expect(parseShowSvgArgs({ svg: SVG }, DEFAULT_MAX_SVG_CHARS)).toEqual({ svg: SVG })
    const declared = `<?xml version="1.0"?>\n${SVG}`
    expect(parseShowSvgArgs({ svg: declared }, DEFAULT_MAX_SVG_CHARS).svg).toBe(declared)
  })

  it('rejects blank, oversized, rootless, unterminated, and DTD-carrying payloads', () => {
    expect(() => parseShowSvgArgs({ svg: '   ' }, DEFAULT_MAX_SVG_CHARS)).toThrow('non-empty')
    expect(() => parseShowSvgArgs({ svg: SVG }, 10)).toThrow('limit is 10')
    expect(() => parseShowSvgArgs({ svg: '<div>not svg</div>' }, DEFAULT_MAX_SVG_CHARS)).toThrow('root element')
    expect(() => parseShowSvgArgs({ svg: '<svg viewBox="0 0 1 1"><rect/>' }, DEFAULT_MAX_SVG_CHARS)).toThrow('closing </svg>')
    expect(() => parseShowSvgArgs({ svg: `<!DOCTYPE svg [<!ENTITY x "y">]>${SVG}` }, DEFAULT_MAX_SVG_CHARS)).toThrow('DOCTYPE')
  })
})

describe('presentation', () => {
  const okResult: ToolResult = { content: [{ type: 'text', text: 'ok' }], isError: false }

  it('presents a pending call as a generic card titled by the graphic title, else a static label', () => {
    expect(presentShowSvgCall({ svg: SVG, title: 'A circle' })).toEqual({ card: 'generic', title: 'A circle' })
    expect(presentShowSvgCall({ svg: SVG })).toEqual({ card: 'generic', title: 'SVG' })
  })

  it('presents a completed call as the svg card carrying the raw markup', () => {
    expect(presentShowSvgResult({ svg: SVG, title: 'A circle' }, okResult))
      .toEqual({ card: 'svg', title: 'A circle', svg: SVG })
  })

  it('falls back to the generic card on failure or a blank replayed payload', () => {
    expect(presentShowSvgResult({ svg: SVG }, { content: [], isError: true })).toBeUndefined()
    expect(presentShowSvgResult({ svg: '   ' }, okResult)).toBeUndefined()
  })
})

describe('execution through the registry', () => {
  it('returns the call id as the reference id and renders the placement instruction', async () => {
    const { call } = await mountTools()
    const result = await call({ svg: SVG, title: 'A circle' })
    expect(result.isError).toBe(false)
    expect(result.value).toEqual({ svgId: 'call-1', chars: SVG.length })
    const text = result.content.map(block => block.type === 'text' ? block.text : '').join('')
    expect(text).toContain('![A circle](dsh-svg://call-1)')
  })

  it('fails a payload over the configured cap with an actionable message', async () => {
    const { call } = await mountTools({ maxSvgChars: 16 })
    const result = await call({ svg: SVG })
    expect(result.isError).toBe(true)
    const text = result.content.map(block => block.type === 'text' ? block.text : '').join('')
    expect(text).toContain('limit is 16')
  })

  it('rejects a non-positive-integer cap at activation', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await expect(ctx.plugin(ToolShowSvg, { maxSvgChars: 0 })).rejects.toThrow('positive integer')
  })
})
