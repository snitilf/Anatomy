import { beforeEach, describe, expect, it } from 'vitest'
import { createUi } from './ui'

describe('sidebar groups', () => {
  beforeEach(() => window.localStorage.clear())

  it('starts with no choices, so every group follows its default', () => {
    expect(createUi().store.getState().groups).toEqual({})
  })

  it('remembers which groups were opened or closed in this browser', () => {
    const first = createUi()
    first.setGroup('parts', false)
    first.setGroup('connections', true)
    expect(createUi().store.getState().groups).toEqual({ parts: false, connections: true })
  })

  it('keeps the groups when the width changes', () => {
    const ui = createUi()
    ui.setGroup('notes', false)
    ui.setSidebarWidth(420)
    const again = createUi().store.getState()
    expect(again.groups).toEqual({ notes: false })
    expect(again.sidebar.width).toBe(420)
  })

  it('ignores a stored value that is not a choice', () => {
    window.localStorage.setItem('anatomy:sidebar', JSON.stringify({ open: true, width: 360, groups: { parts: 'no', notes: false } }))
    expect(createUi().store.getState().groups).toEqual({ notes: false })
  })
})

describe('the open lesson', () => {
  it('starts closed, and holds the lesson and the part whose row opened it', () => {
    const ui = createUi()
    expect(ui.store.getState().lesson).toBeUndefined()
    ui.openLesson('approval-gate', 'permission-check')
    expect(ui.store.getState().lesson).toEqual({ id: 'approval-gate', opener: 'permission-check' })
    ui.closeLesson()
    expect(ui.store.getState().lesson).toBeUndefined()
  })
})
