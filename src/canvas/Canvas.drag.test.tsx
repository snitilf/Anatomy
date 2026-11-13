import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createStore } from 'zustand/vanilla'
import { AppStoreContext } from '../app/store'
import { initialState, reducer, type Action } from '../app/state'
import { exampleBoard } from '../overlay/testBoards'
import { Canvas } from './Canvas'

const ID = exampleBoard().components[0]!.id

function setup(walkthrough = false) {
  let state = reducer(initialState, { type: 'boardOpened', board: exampleBoard(), warnings: [] })
  if (walkthrough) state = reducer(state, { type: 'scenarioStarted', id: exampleBoard().scenarios[0]!.id })
  const dispatch = vi.fn<(action: Action) => void>()
  const view = render(
    <AppStoreContext.Provider value={{ store: createStore(() => state), dispatch }}>
      <div style={{ width: 800, height: 600 }}>
        <Canvas />
      </div>
    </AppStoreContext.Provider>,
  )
  const node = () => view.container.querySelector(`.react-flow__node[data-id="${ID}"]`) as HTMLElement
  // d3-drag reads `view` from the event. jsdom only accepts its own window object there, so it is set afterwards.
  const mouse = (type: string, x: number, y: number) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })
    Object.defineProperty(event, 'view', { value: window })
    return event
  }
  const press = (x = 100, y = 100) => fireEvent(node(), mouse('mousedown', x, y))
  const move = (x: number, y: number) => fireEvent(window, mouse('mousemove', x, y))
  const release = (x: number, y: number) => fireEvent(window, mouse('mouseup', x, y))
  const moves = () => dispatch.mock.calls.map(([a]) => a).filter((a) => a.type === 'cardMoved')
  return { state, dispatch, node, press, move, release, moves }
}

describe('dragging a card', () => {
  it('saves the new place once, when the card is dropped', async () => {
    const t = setup()
    const start = t.node().style.transform
    act(() => t.press())
    for (let i = 1; i <= 12; i++) act(() => t.move(100 + i * 10, 100 + i * 4))
    expect(t.node().style.transform).not.toBe(start)
    expect(t.moves()).toHaveLength(0)
    act(() => t.release(220, 148))
    expect(t.moves()).toHaveLength(1)
    const [move] = t.moves()
    expect(move).toMatchObject({ type: 'cardMoved', id: ID })
    const home = t.state.overlay!.positions[ID]!
    // The first move only picks the card up, so the card travels from the second pointer position on.
    expect(move).toMatchObject({ point: { x: home.x + 110, y: home.y + 44 } })
  })

  it('puts the card back when Escape is pressed, and changes nothing else', () => {
    const t = setup()
    const start = t.node().style.transform
    act(() => t.press())
    act(() => t.move(110, 104))
    act(() => t.move(160, 140))
    expect(t.node().style.transform).not.toBe(start)
    t.dispatch.mockClear()
    act(() => {
      fireEvent.keyDown(document.body, { key: 'Escape' })
    })
    expect(t.node().style.transform).toBe(start)
    // The pointer is still down. Moving on does not bring the card back.
    act(() => t.move(240, 200))
    expect(t.node().style.transform).toBe(start)
    act(() => t.release(240, 200))
    expect(t.node().style.transform).toBe(start)
    expect(t.dispatch).not.toHaveBeenCalled()
  })

  it('picks the card up without opening it while a walkthrough plays', () => {
    const t = setup(true)
    act(() => t.press())
    act(() => t.move(110, 104))
    act(() => t.move(180, 150))
    act(() => t.release(180, 150))
    expect(t.dispatch.mock.calls.map(([a]) => a.type)).toEqual(['cardMoved'])
  })

  it('opens the card when a drag starts outside a walkthrough', () => {
    const t = setup()
    act(() => t.press())
    act(() => t.move(110, 104))
    act(() => t.move(180, 150))
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'select', selection: { type: 'component', id: ID } })
  })
})
