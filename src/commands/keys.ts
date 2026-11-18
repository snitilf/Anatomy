/**
 * Keyboard shortcuts, written as strings such as `Mod+Shift+Z`, `Shift+Digit1`, `]`, or `ArrowRight`.
 * `Mod` is Cmd on a Mac and Ctrl elsewhere. `Ctrl` is the Control key on every platform.
 * A single punctuation key matches whatever Shift does, so `+` works with or without it on any layout.
 */
export type Keys = string

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform)

const TEXT_INPUTS = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number'])

/** True when the element edits text, so its own keys (undo, arrows, letters) win over the board's. */
export function editsText(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  return target instanceof HTMLInputElement && TEXT_INPUTS.has(target.type)
}

interface Combo {
  mod: boolean
  ctrl: boolean
  shift: boolean
  /** A `KeyboardEvent.code` such as `Digit1`, or a lowercase `KeyboardEvent.key`. */
  code?: string
  key?: string
  /** A punctuation key: Shift does not matter. */
  loose: boolean
}

function parse(keys: Keys): Combo {
  const tokens = keys === '+' ? ['+'] : keys.split('+').map((t) => (t === '' ? '+' : t))
  const last = tokens[tokens.length - 1] ?? ''
  const mods = new Set(tokens.slice(0, -1))
  const code = /^Digit\d$/.test(last) ? last : undefined
  const loose = code === undefined && last.length === 1 && !/[a-z0-9]/i.test(last)
  return {
    mod: mods.has('Mod'),
    ctrl: mods.has('Ctrl'),
    shift: mods.has('Shift'),
    ...(code ? { code } : { key: last.toLowerCase() }),
    loose,
  }
}

export type KeyEvent = Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>

/** `=` is the unshifted `+` on most layouts, and `_` the shifted `-`. */
const twin = (key: string) => (key === '=' ? '+' : key === '_' ? '-' : key)

/** True when the event is this shortcut. */
export function matches(keys: Keys, event: KeyEvent): boolean {
  if (event.altKey || sequenceOf(keys)) return false
  const combo = parse(keys)
  if (combo.ctrl) {
    if (!event.ctrlKey || event.metaKey) return false
  } else if (combo.mod !== (event.metaKey || event.ctrlKey)) return false
  if (!combo.loose && combo.shift !== event.shiftKey) return false
  if (combo.code) return event.code === combo.code
  const key = event.key.toLowerCase()
  return twin(key) === twin(combo.key ?? '')
}

/**
 * A sequence is two single keys typed one after the other, written with a space: `G O`.
 * Returns the keys, or undefined for an ordinary shortcut.
 */
export function sequenceOf(keys: Keys): readonly [Keys, Keys] | undefined {
  const parts = keys.split(' ')
  return parts.length === 2 && parts[0] !== '' && parts[1] !== '' ? [parts[0] as Keys, parts[1] as Keys] : undefined
}

export type SequenceStep =
  | { action: 'pass' }
  | { action: 'arm'; key: string }
  | { action: 'swallow' }
  | { action: 'run'; sequence: readonly [Keys, Keys] }

/**
 * What a plain key does about key sequences. After the first key of one, the next key is always taken:
 * it completes a sequence, or restarts one (G G), or does nothing. It never reaches a tool.
 * `armed` is the first key while it still waits, lowercase. `typed` is the key now, lowercase.
 */
export function stepSequence(armed: string | undefined, typed: string, sequences: readonly (readonly [Keys, Keys])[]): SequenceStep {
  const starts = (key: string) => sequences.some(([a]) => a.toLowerCase() === key)
  if (armed !== undefined) {
    const done = sequences.find(([a, b]) => a.toLowerCase() === armed && b.toLowerCase() === typed)
    if (done) return { action: 'run', sequence: done }
    return starts(typed) ? { action: 'arm', key: typed } : { action: 'swallow' }
  }
  return starts(typed) ? { action: 'arm', key: typed } : { action: 'pass' }
}

/** True for a shortcut with no Cmd or Ctrl, which must not fire while a field, a dialog, or a menu has focus. */
export function isSingleKey(keys: Keys): boolean {
  if (sequenceOf(keys)) return true
  const combo = parse(keys)
  return !combo.mod && !combo.ctrl
}

const MAC_NAMES: Record<string, string> = { Mod: '⌘', Ctrl: '⌃', Shift: '⇧', Alt: '⌥' }
const NAMES: Record<string, string> = {
  Enter: '↵',
  Escape: 'Esc',
  ArrowRight: '→',
  ArrowLeft: '←',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Backspace: '⌫',
  Delete: '⌦',
}

/** The shortcut for `aria-keyshortcuts`: `Mod` becomes Meta on a Mac and Control elsewhere. */
export function ariaShortcut(keys: Keys | undefined, mac = isMac): string | undefined {
  return keys?.replace(/\bMod\b/, mac ? 'Meta' : 'Control')
}

/** The shortcut as it is printed: `⌘⇧Z` on a Mac, `Ctrl Shift Z` elsewhere. */
export function formatKeys(keys: Keys, mac = isMac): string {
  const tokens = keys === '+' ? ['+'] : keys.split('+').map((t) => (t === '' ? '+' : t))
  const names = tokens.map((t, i) => {
    if (i < tokens.length - 1) return mac ? (MAC_NAMES[t] ?? t) : t === 'Mod' ? 'Ctrl' : t
    if (/^Digit\d$/.test(t)) return t.slice(5)
    return NAMES[t] ?? (t.length === 1 ? t.toUpperCase() : t)
  })
  return mac ? names.join('') : names.join(' ')
}

/**
 * Single keys the whiteboard tools take: Select, Hand, Pen, Rectangle, Ellipse, Arrow, Text, Sticky note, and New part.
 * No other command may use them.
 */
export const TOOL_KEYS: readonly Keys[] = ['V', 'H', 'P', 'R', 'O', 'A', 'T', 'S', 'N']
