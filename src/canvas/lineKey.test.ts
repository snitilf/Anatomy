import { describe, expect, it } from 'vitest'
import { KIND_ORDER, KIND_WORDS } from '../app/labels'
import type { RelationshipKind } from '../board/schema'
import { KIND_STYLE, type KindStyle } from './kinds'
import { lineKeyRows } from './lineKey'

describe('the line key', () => {
  it('has one row for each way a line is drawn, and names every kind that is drawn that way', () => {
    const rows = lineKeyRows()
    const looks = new Set(KIND_ORDER.map((k) => `${KIND_STYLE[k].dash}|${KIND_STYLE[k].width}`))
    expect(rows).toHaveLength(looks.size)
    expect(rows.length).toBeLessThan(KIND_ORDER.length)
    expect(rows.flatMap((r) => r.kinds).sort()).toEqual([...KIND_ORDER].sort())
    expect(rows.map((r) => r.label)).toEqual(['Calls, triggers, sends data', 'Stores or reads data', 'Depends on, not known'])
  })

  it('keeps the order of the kinds, and the words of each kind as the title', () => {
    const rows = lineKeyRows()
    expect(rows.flatMap((r) => r.kinds)).toEqual([...KIND_ORDER])
    expect(rows[0]?.words).toBe(`${KIND_WORDS.calls}; ${KIND_WORDS.triggers}; ${KIND_WORDS['sends-data-to']}`)
    expect(rows[rows.length - 1]?.words).toBe(`${KIND_WORDS['depends-on']}; ${KIND_WORDS.unknown}`)
  })

  it('regroups by itself when a style changes', () => {
    const same: KindStyle = { dash: '', width: 1.25 }
    const all = Object.fromEntries(KIND_ORDER.map((k) => [k, same])) as Record<RelationshipKind, KindStyle>
    const one = lineKeyRows(all)
    expect(one).toHaveLength(1)
    expect(one[0]?.label).toBe('Calls, triggers, sends data to, stores data in, reads data from, depends on, not known')
    const split = lineKeyRows({ ...KIND_STYLE, triggers: { ...KIND_STYLE.triggers, width: 2 } })
    expect(split.map((r) => r.kinds)).toContainEqual(['triggers'])
    expect(split.map((r) => r.label)).toContain('Triggers')
    expect(split.map((r) => r.label)).toContain('Calls, sends data to')
  })
})
