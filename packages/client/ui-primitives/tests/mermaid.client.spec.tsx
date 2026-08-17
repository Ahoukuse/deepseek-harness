// @vitest-environment jsdom
// MermaidBlock + the ```mermaid fence route: a settled fence swaps to the
// rendered diagram, a streaming fence stays the plain code block, and a
// source mermaid rejects falls back to the plain fence. The mermaid module
// is mocked — these specs pin the wiring (lazy load, strict init, fallback
// arms), not mermaid's own rendering.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MarkdownText } from './markdown-test-components.tsx'
import { MermaidBlock } from '../src/markdown/MermaidBlock.tsx'

const initialize = vi.fn()
const parse = vi.fn().mockResolvedValue({ diagramType: 'flowchart' })
// width mirrors useMaxWidth: false output: the absolute pixel width rides the
// width attribute, which the auto-fit measure reads.
const renderDiagram = vi.fn().mockImplementation(
  (id: string) => Promise.resolve({ svg: `<svg data-diagram-id="${id}" width="1000"><g></g></svg>` }),
)

vi.mock('mermaid', () => ({
  default: { initialize, parse, render: renderDiagram },
}))

const FENCE = '```mermaid\ngraph TD; A-->B\n```'

afterEach(cleanup)

beforeAll(() => {
  // Set before the singleton loader ever runs: init must read the ui-theme
  // dark marker at that moment.
  document.body.toggleAttribute('data-ds-dark-theme', true)
})

describe('```mermaid fence', () => {
  it('renders the diagram once settled, initializing mermaid lazily in strict mode', async () => {
    const view = render(<MarkdownText text={FENCE} />)
    // Before the async load resolves, the fence shows as a plain code block.
    expect(view.container.querySelector('pre')?.textContent).toBe('graph TD; A-->B')
    await waitFor(() => {
      expect(view.container.querySelector('svg[data-diagram-id]')).not.toBeNull()
    })
    // The swap replaced the fallback fence entirely.
    expect(view.container.querySelector('pre')).toBeNull()
    expect(initialize).toHaveBeenCalledTimes(1)
    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'dark',
      // Absolute sizing: fit-to-container would shrink wide diagrams (and
      // collapse inside the fit-content wrapper); spot-check two families.
      sequence: { useMaxWidth: false },
      flowchart: { useMaxWidth: false },
    }))
    expect(renderDiagram).toHaveBeenCalledWith(expect.stringMatching(/^dsh-mermaid-\d+$/), 'graph TD; A-->B')
  })

  it('keeps the plain code block while streaming', () => {
    renderDiagram.mockClear()
    const view = render(<MarkdownText text={FENCE} streaming />)
    expect(view.container.querySelector('pre')?.textContent).toBe('graph TD; A-->B')
    // The streaming arm never mounts MermaidBlock, so no render is attempted.
    expect(renderDiagram).not.toHaveBeenCalled()
  })

  it('zooms through the control chip, clamps at the bounds, and resets', async () => {
    const view = render(<MermaidBlock code="graph TD; A-->B" copyLabel="Copy" copiedLabel="Copied" />)
    await waitFor(() => {
      expect(view.container.querySelector('svg[data-diagram-id]')).not.toBeNull()
    })
    // The zoom travels as a custom property on the diagram's direct wrapper.
    const content = view.container.querySelector('svg[data-diagram-id]')!.parentElement!
    expect(content.style.getPropertyValue('--dsh-mermaid-zoom')).toBe('1')
    fireEvent.click(view.getByRole('button', { name: '放大' }))
    expect(content.style.getPropertyValue('--dsh-mermaid-zoom')).toBe('1.25')
    expect(view.getByRole('button', { name: '恢复原始大小' }).textContent).toBe('125%')
    // 1 → ×1.25⁷ passes 4; the clamp pins the scale (and the label) at 400%.
    for (let click = 0; click < 9; click++) fireEvent.click(view.getByRole('button', { name: '放大' }))
    expect(content.style.getPropertyValue('--dsh-mermaid-zoom')).toBe('4')
    expect(view.getByRole('button', { name: '恢复原始大小' }).textContent).toBe('400%')
    fireEvent.click(view.getByRole('button', { name: '恢复原始大小' }))
    expect(content.style.getPropertyValue('--dsh-mermaid-zoom')).toBe('1')
    fireEvent.click(view.getByRole('button', { name: '缩小' }))
    expect(content.style.getPropertyValue('--dsh-mermaid-zoom')).toBe('0.8')
    // ÷1.25 repeatedly floors at the 0.5 clamp.
    for (let click = 0; click < 9; click++) fireEvent.click(view.getByRole('button', { name: '缩小' }))
    expect(content.style.getPropertyValue('--dsh-mermaid-zoom')).toBe('0.5')
  })

  it('auto-fits a diagram wider than the column, and the chip resets to absolute size', async () => {
    // jsdom does no layout (clientWidth is 0, which the fit guard skips), so
    // give every element a measured width for this spec.
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() { return 500 },
    })
    try {
      const view = render(<MermaidBlock code="graph LR; A-->B" copyLabel="Copy" copiedLabel="Copied" />)
      await waitFor(() => {
        expect(view.container.querySelector('svg[data-diagram-id]')).not.toBeNull()
      })
      const content = view.container.querySelector('svg[data-diagram-id]')!.parentElement!
      // 500 available / 1000 natural → the diagram starts at half size.
      await waitFor(() => {
        expect(content.style.getPropertyValue('--dsh-mermaid-zoom')).toBe('0.5')
      })
      expect(view.getByRole('button', { name: '恢复原始大小' }).textContent).toBe('50%')
      fireEvent.click(view.getByRole('button', { name: '恢复原始大小' }))
      expect(content.style.getPropertyValue('--dsh-mermaid-zoom')).toBe('1')
    } finally {
      if (descriptor !== undefined) Object.defineProperty(HTMLElement.prototype, 'clientWidth', descriptor)
    }
  })

  it('falls back to the plain fence when mermaid rejects the source', async () => {
    parse.mockRejectedValueOnce(new Error('Parse error on line 1'))
    const view = render(<MermaidBlock code="graph TD; A-->" copyLabel="Copy" copiedLabel="Copied" />)
    await waitFor(() => {
      expect(parse).toHaveBeenCalledWith('graph TD; A-->')
    })
    // The rejection resolves the state to the fallback arm, which stays.
    await waitFor(() => {
      expect(view.container.querySelector('pre')?.textContent).toBe('graph TD; A-->')
    })
    expect(view.container.querySelector('svg')).toBeNull()
  })
})
