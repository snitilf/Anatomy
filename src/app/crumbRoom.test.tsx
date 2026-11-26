import { render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { measureCrumbRoom, useCrumbRoom } from './crumbRoom'

function setBox(el: HTMLElement | null, width: number) {
  if (!el) return
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: width })
  Object.defineProperty(el, 'offsetWidth', { configurable: true, value: width })
}

describe('crumbRoom', () => {
  const realRO = globalThis.ResizeObserver

  afterEach(() => {
    globalThis.ResizeObserver = realRO
  })

  it('gives the trail the left zone width and excludes the center and right zones', () => {
    const bar = document.createElement('header')
    setBox(bar, 1440)

    const left = document.createElement('div')
    setBox(left, 620)
    const nav = document.createElement('nav')
    const save = document.createElement('div')
    setBox(save, 0)
    left.append(nav, save)

    const center = document.createElement('div')
    setBox(center, 160)
    const right = document.createElement('div')
    setBox(right, 620)

    bar.append(left, center, right)
    document.body.append(bar)
    try {
      expect(measureCrumbRoom(left, nav)).toBe(620)

      // A visible sibling inside the left zone (such as SaveStatus) subtracts from the trail's room.
      setBox(save, 72)
      save.style.marginLeft = '12px'
      expect(measureCrumbRoom(left, nav)).toBe(536)

      // A hidden sibling inside the left zone takes no room.
      save.style.display = 'none'
      expect(measureCrumbRoom(left, nav)).toBe(620)
    } finally {
      bar.remove()
    }
  })

  it('useCrumbRoom measures the left zone parent, not the full bar', () => {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    let measured: number | undefined
    function Sized() {
      const nav = useRef<HTMLElement>(null)
      measured = useCrumbRoom(nav)
      return (
        <header ref={(el) => setBox(el, 1440)}>
          <div ref={(el) => setBox(el, 540)}>
            <nav ref={nav} />
            <div ref={(el) => setBox(el, 0)} />
          </div>
          <div ref={(el) => setBox(el, 160)} />
          <div ref={(el) => setBox(el, 540)} />
        </header>
      )
    }
    render(<Sized />)
    expect(measured).toBe(540)
  })
})
