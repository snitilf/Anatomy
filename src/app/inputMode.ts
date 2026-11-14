/**
 * Whether the last input was a key or a pointer. Motion that a pointer starts may play; motion that a key starts
 * does not, because keys repeat and an animation would lag behind them.
 */
let lastInput: 'keyboard' | 'pointer' = 'pointer'
let listening = false

export function lastInputWasKeyboard(): boolean {
  if (!listening && typeof window !== 'undefined') {
    listening = true
    window.addEventListener('keydown', () => (lastInput = 'keyboard'), true)
    window.addEventListener('pointerdown', () => (lastInput = 'pointer'), true)
  }
  return lastInput === 'keyboard'
}

// Start listening as soon as the app loads, so the first answer is right.
lastInputWasKeyboard()
