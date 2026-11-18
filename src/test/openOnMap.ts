import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect } from 'vitest'
import { press } from './press'

/** The way a person gets from the board to one part now that the sidebar has no list: the Overview page, then the row. */
export function openPart(label: string | RegExp): HTMLElement {
  press(screen.getByRole('tab', { name: 'Overview' }))
  const name = typeof label === 'string' ? new RegExp(`^${label}`) : label
  const row = within(screen.getByTestId('overview'))
    .getAllByRole('button', { name })
    .find((b) => b.dataset.row?.startsWith('part:'))!
  row.focus()
  fireEvent.click(row)
  return row
}

/** A connection by its menu entry, which reads "label: from to to". Typing finds it. */
export async function openConnection(label: string | RegExp) {
  act(() => {
    fireEvent.keyDown(document.body, { key: 'k', metaKey: true })
  })
  const menu = within(await screen.findByRole('dialog', { name: 'Command menu' }))
  fireEvent.change(menu.getByRole('combobox'), { target: { value: typeof label === 'string' ? label : label.source } })
  fireEvent.click(await menu.findByRole('option', { name: typeof label === 'string' ? new RegExp(`^${label}`) : label }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Command menu' })).not.toBeInTheDocument())
  await act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))))
}
