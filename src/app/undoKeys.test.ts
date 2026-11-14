import { describe, expect, it } from 'vitest'
import { undoCommand } from './undoKeys'

const key = (key: string, mods: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean } = {}, target: EventTarget | null = document.body) => ({
  key,
  metaKey: mods.meta ?? false,
  ctrlKey: mods.ctrl ?? false,
  shiftKey: mods.shift ?? false,
  altKey: mods.alt ?? false,
  target,
})

describe('undoCommand', () => {
  it('maps Cmd or Ctrl with Z to undo, with Shift to redo, and Ctrl+Y to redo', () => {
    expect(undoCommand(key('z', { meta: true }))).toBe('undo')
    expect(undoCommand(key('z', { ctrl: true }))).toBe('undo')
    expect(undoCommand(key('Z', { meta: true, shift: true }))).toBe('redo')
    expect(undoCommand(key('Z', { ctrl: true, shift: true }))).toBe('redo')
    expect(undoCommand(key('y', { ctrl: true }))).toBe('redo')
  })

  it('ignores other keys, Alt, and plain Z', () => {
    expect(undoCommand(key('z'))).toBeUndefined()
    expect(undoCommand(key('z', { meta: true, alt: true }))).toBeUndefined()
    expect(undoCommand(key('y', { meta: true }))).toBeUndefined()
    expect(undoCommand(key('x', { meta: true }))).toBeUndefined()
  })

  it('leaves undo to a text field, but not to a button or a checkbox', () => {
    const field = document.createElement('input')
    const area = document.createElement('textarea')
    const box = Object.assign(document.createElement('input'), { type: 'checkbox' })
    const button = document.createElement('button')
    expect(undoCommand(key('z', { meta: true }, field))).toBeUndefined()
    expect(undoCommand(key('z', { meta: true }, area))).toBeUndefined()
    expect(undoCommand(key('z', { meta: true }, box))).toBe('undo')
    expect(undoCommand(key('z', { meta: true }, button))).toBe('undo')
  })
})
