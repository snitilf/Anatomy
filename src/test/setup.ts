import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// findBy and waitFor give up after one second by default, which a busy machine can exceed without anything being wrong.
configure({ asyncUtilTimeout: 5000 })

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

// jsdom has no scrollIntoView. cmdk keeps the active row in view with it.
Element.prototype.scrollIntoView = function scrollIntoView() {}

// jsdom has no matchMedia. Sonner reads the color scheme and the motion setting from it.
window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }) as MediaQueryList

afterEach(() => {
  cleanup()
  // The sidebar's width and collapse are kept per browser. Each test starts from the default.
  localStorage.removeItem('anatomy:sidebar')
})
