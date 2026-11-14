import { describe, expect, it } from 'vitest'
import { inView, SnapTargets } from './snap'

const card = (x: number, y: number, width = 240, height = 112) => ({ x, y, width, height })

describe('SnapTargets', () => {
  const targets = new SnapTargets([card(0, 0), card(400, 300)])

  it('lines a moving card up with the nearest edge or middle within reach, and draws a guide there', () => {
    const r = targets.move(card(404, 3), 6)
    expect(r.x).toBe(400)
    expect(r.y).toBe(0)
    expect(r.vertical?.at).toBe(400)
    expect(r.horizontal?.at).toBe(0)
    // The guide runs from one card to the other.
    expect(r.vertical).toMatchObject({ from: 0, to: 412 })
  })

  it('lines up middles too', () => {
    const r = targets.move(card(1000, 304), 6)
    expect(r.y).toBe(300)
  })

  it('leaves a card alone when nothing is within reach', () => {
    const r = targets.move(card(700, 150), 6)
    expect(r).toEqual({ x: 700, y: 150 })
  })

  it('snaps the right and bottom edges of a card being resized', () => {
    const r = targets.resize(card(100, 100, 296, 204), 6)
    expect(r.width).toBe(300)
    expect(r.height).toBe(200)
  })
})

describe('inView', () => {
  it('keeps only the cards the map shows', () => {
    const cards = [card(0, 0), card(2000, 0)]
    expect(inView(cards, { x: 0, y: 0, zoom: 1 }, { width: 1000, height: 700 })).toEqual([cards[0]])
  })
})
