import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BrandMark } from './BrandMark'

/** The drawing on the 24 grid. Two decimals at least: rounding it further moves its edges off whole pixels at 16 px. */
const BLADE =
  'M10.26 2.16A1 1 0 0 1 11.21 1.5L12.8 1.5A1 1 0 0 1 13.74 2.16L20.64 21.5A0.75 0.75 0 0 1 19.94 22.5L14.03 22.5A0.75 0.75 0 0 1 13.32 22L9.75 12L6.18 22A0.75 0.75 0 0 1 5.47 22.5L4.06 22.5A0.75 0.75 0 0 1 3.36 21.5Z'

const favicon = readFileSync(join(process.cwd(), 'public/favicon.svg'), 'utf8')

describe('BrandMark', () => {
  it('is one path in the text color, with no stroke and no second part', () => {
    render(<BrandMark />)
    const svg = screen.getByTestId('brand-mark')
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
    const shapes = svg.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon, g, use')
    expect(shapes).toHaveLength(1)
    const path = svg.querySelector('path')!
    expect(path.getAttribute('fill')).toBe('var(--fg)')
    expect(path.getAttribute('d')).toBe(BLADE)
    expect(path.hasAttribute('stroke')).toBe(false)
    expect(path.hasAttribute('transform')).toBe(false)
    // One flat ink: never the accent, never amber.
    expect(svg.outerHTML).not.toMatch(/--accent|--user|stroke=/)
  })

  it('is the same drawing as the favicon', () => {
    const d = [...favicon.matchAll(/\sd="([^"]*)"/g)].map((m) => m[1])
    expect(d).toEqual([BLADE])
  })

  it('is a picture beside the word, so it has no name of its own', () => {
    render(<BrandMark />)
    const svg = screen.getByTestId('brand-mark')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('focusable', 'false')
  })

  it('is 16 px unless asked otherwise, so its edges land on whole pixels', () => {
    const { rerender } = render(<BrandMark />)
    expect(screen.getByTestId('brand-mark')).toHaveAttribute('width', '16')
    expect(screen.getByTestId('brand-mark')).toHaveAttribute('height', '16')
    rerender(<BrandMark size={32} />)
    expect(screen.getByTestId('brand-mark')).toHaveAttribute('width', '32')
  })
})
