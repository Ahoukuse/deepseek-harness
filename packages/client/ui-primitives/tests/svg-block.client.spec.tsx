// @vitest-environment jsdom
// SvgBlock is the sanitization boundary for the `svg` render intent: model
// markup inlines into the host document, so this spec pins what survives (the
// drawable graphic) and what must not (scripts, event handlers, the
// inline-specific holes: foreignObject smuggling HTML, a document-global
// <style>, anchors). A payload with no svg root renders the invalid note, not
// an empty card.

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { sanitizeSvg, SvgBlock } from '../src/index.ts'

afterEach(cleanup)

const CIRCLE = '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4" fill="currentColor"/></svg>'

describe('sanitizeSvg', () => {
  it('passes a benign graphic through with its geometry attributes intact', () => {
    const clean = sanitizeSvg(CIRCLE)
    expect(clean).toContain('<svg')
    expect(clean).toContain('viewBox="0 0 10 10"')
    expect(clean).toContain('<circle')
  })

  it('strips script elements and event-handler attributes', () => {
    const clean = sanitizeSvg(
      '<svg viewBox="0 0 1 1"><script>alert(1)</script><rect onclick="alert(2)" onload="alert(3)" width="1" height="1"/></svg>',
    )
    expect(clean).not.toBeNull()
    expect(clean).not.toContain('script')
    expect(clean).not.toContain('onclick')
    expect(clean).not.toContain('onload')
    expect(clean).toContain('<rect')
  })

  it('strips the inline-specific holes: foreignObject, style, and anchors', () => {
    const clean = sanitizeSvg(
      '<svg viewBox="0 0 1 1">'
      + '<foreignObject><iframe src="https://evil.test"></iframe></foreignObject>'
      + '<style>body { display: none }</style>'
      + '<a href="https://evil.test"><rect width="1" height="1"/></a>'
      + '</svg>',
    )
    expect(clean).not.toBeNull()
    expect(clean).not.toContain('foreignObject')
    expect(clean).not.toContain('iframe')
    expect(clean).not.toContain('<style')
    expect(clean).not.toContain('display: none')
    expect(clean).not.toContain('<a ')
    // The anchor's drawable child survives its stripped wrapper.
    expect(clean).toContain('<rect')
  })

  it('returns null for a payload with no svg root (an HTML document is not a graphic)', () => {
    expect(sanitizeSvg('<div><p>hello</p></div>')).toBeNull()
    expect(sanitizeSvg('plain text')).toBeNull()
  })
})

describe('SvgBlock', () => {
  it('renders the sanitized graphic inline', () => {
    const view = render(<SvgBlock svg={CIRCLE} />)
    expect(view.container.querySelector('[data-svg="graphic"]')).not.toBeNull()
    const svg = view.container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.querySelector('circle')).not.toBeNull()
  })

  it('never mounts a script even when the payload carries one', () => {
    const view = render(<SvgBlock svg={'<svg viewBox="0 0 1 1"><script>window.pwned = true</script><rect width="1" height="1"/></svg>'} />)
    expect(view.container.querySelector('script')).toBeNull()
    expect((window as { pwned?: boolean }).pwned).toBeUndefined()
  })

  it('renders the invalid note for a non-svg payload, with the label overridable', () => {
    const view = render(<SvgBlock svg="<p>not a graphic</p>" invalidLabel="cannot render" />)
    expect(view.container.querySelector('[data-svg="invalid"]')).not.toBeNull()
    expect(view.container.textContent).toContain('cannot render')
    expect(view.container.querySelector('svg')).toBeNull()
  })
})
