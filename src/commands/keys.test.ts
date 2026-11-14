import { describe, expect, it } from 'vitest'
import { editsText, formatKeys, isSingleKey, matches, TOOL_KEYS } from './keys'
import { COMMANDS } from './list'

const press = (key: string, mods: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean } = {}, code = '') => ({
  key,
  code,
  metaKey: mods.meta ?? false,
  ctrlKey: mods.ctrl ?? false,
  shiftKey: mods.shift ?? false,
  altKey: mods.alt ?? false,
})

describe('shortcuts', () => {
  it('maps Cmd or Ctrl with Z to undo, with Shift to redo, and Ctrl+Y to redo', () => {
    expect(matches('Mod+Z', press('z', { meta: true }))).toBe(true)
    expect(matches('Mod+Z', press('z', { ctrl: true }))).toBe(true)
    expect(matches('Mod+Shift+Z', press('Z', { meta: true, shift: true }))).toBe(true)
    expect(matches('Mod+Z', press('Z', { meta: true, shift: true }))).toBe(false)
    expect(matches('Ctrl+Y', press('y', { ctrl: true }))).toBe(true)
    expect(matches('Ctrl+Y', press('y', { meta: true }))).toBe(false)
  })

  it('ignores Alt, and a plain letter never matches a Cmd shortcut', () => {
    expect(matches('Mod+Z', press('z'))).toBe(false)
    expect(matches('Mod+Z', press('z', { meta: true, alt: true }))).toBe(false)
    expect(matches('C', press('c', { meta: true }))).toBe(false)
    expect(matches('C', press('c'))).toBe(true)
  })

  it('reads Shift with a digit from the key code, and punctuation whatever Shift does', () => {
    expect(matches('Shift+Digit1', press('!', { shift: true }, 'Digit1'))).toBe(true)
    expect(matches('Shift+Digit1', press('1', {}, 'Digit1'))).toBe(false)
    expect(matches('+', press('+', { shift: true }))).toBe(true)
    expect(matches('+', press('='))).toBe(true)
    expect(matches('Mod+=', press('+', { meta: true, shift: true }))).toBe(true)
    expect(matches(']', press(']'))).toBe(true)
  })

  it('prints keys for the platform', () => {
    expect(formatKeys('Mod+Shift+Z', true)).toBe('⌘⇧Z')
    expect(formatKeys('Mod+Shift+Z', false)).toBe('Ctrl Shift Z')
    expect(formatKeys('Shift+Digit1', true)).toBe('⇧1')
    expect(formatKeys('Escape', false)).toBe('Esc')
    expect(formatKeys('ArrowRight', true)).toBe('→')
  })

  it('leaves keys to a text field, but not to a button or a checkbox', () => {
    expect(editsText(document.createElement('input'))).toBe(true)
    expect(editsText(document.createElement('textarea'))).toBe(true)
    expect(editsText(Object.assign(document.createElement('input'), { type: 'checkbox' }))).toBe(false)
    expect(editsText(document.createElement('button'))).toBe(false)
  })
})

describe('the command list', () => {
  it('has one entry per ID', () => {
    const ids = COMMANDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('leaves the whiteboard tool keys free', () => {
    const used = COMMANDS.flatMap((c) => c.keys ?? [])
    for (const key of TOOL_KEYS) {
      expect(used.filter((k) => isSingleKey(k) && matches(k, press(key.toLowerCase())))).toEqual([])
    }
  })
})
