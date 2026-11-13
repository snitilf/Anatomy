import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// React Flow measures elements. jsdom has no layout, so it gets stand-ins.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub

class DOMMatrixStub {
  m22 = 1
  constructor(_init?: string) {}
}
// @ts-expect-error a partial stand-in is enough for React Flow's zoom math
globalThis.DOMMatrixReadOnly = DOMMatrixStub

Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 })
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 })

afterEach(() => {
  cleanup()
})
