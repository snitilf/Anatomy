import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusGlyph, StatusWord } from './StatusGlyph'
import { ITEM_STATES, STATE_WORD } from './state'

describe('StatusGlyph', () => {
  it.each(ITEM_STATES)('draws %s as an image named with its word', (state) => {
    render(<StatusGlyph state={state} />)
    const glyph = screen.getByRole('img', { name: STATE_WORD[state] })
    expect(glyph).toHaveAttribute('data-state', state)
    expect(glyph.querySelector('circle, path')).not.toBeNull()
  })

  it('hides the glyph from assistive technology when the word sits beside it', () => {
    render(<StatusWord state="sent" />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('Sent')).toBeInTheDocument()
  })

  it('draws every state differently', () => {
    const shapes = ITEM_STATES.map((state) => {
      const { container, unmount } = render(<StatusGlyph state={state} />)
      const html = container.querySelector('svg')!.innerHTML.replace(/id="[^"]*"/g, '').replace(/url\(#[^)]*\)/g, '')
      unmount()
      return html
    })
    expect(new Set(shapes).size).toBe(ITEM_STATES.length)
  })

  it('scales to the size asked for', () => {
    render(<StatusGlyph state="unsent" size={28} />)
    expect(screen.getByRole('img')).toHaveAttribute('width', '28')
  })
})
