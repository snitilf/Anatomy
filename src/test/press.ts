import { fireEvent } from '@testing-library/react'

/** A full mouse press, as a person makes it. Base UI opens its menus on the press, not on the click. */
export function press(element: Element) {
  fireEvent.pointerDown(element, { button: 0, pointerType: 'mouse' })
  fireEvent.mouseDown(element, { button: 0 })
  fireEvent.pointerUp(element, { button: 0, pointerType: 'mouse' })
  fireEvent.mouseUp(element, { button: 0 })
  fireEvent.click(element, { button: 0 })
}
