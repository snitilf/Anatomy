import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Segmented, type SegmentedOption } from './Segmented'

type View = 'map' | 'overview' | 'review' | 'notes'

const OPTIONS: SegmentedOption<View>[] = [
  { value: 'map', label: 'Map' },
  { value: 'overview', label: 'Overview' },
  { value: 'review', label: 'Review', disabled: true },
  { value: 'notes', label: 'Notes', count: 6 },
]

function Harness({ kind, onChange, options = OPTIONS }: { kind: 'tabs' | 'choice'; onChange?: (v: View) => void; options?: SegmentedOption<View>[] }) {
  const [value, setValue] = useState<View>('map')
  return (
    <Segmented
      kind={kind}
      label="View"
      value={value}
      options={options}
      onChange={(next) => {
        setValue(next)
        onChange?.(next)
      }}
    />
  )
}

describe('Segmented as tabs', () => {
  it('exposes a tablist of tabs, and marks the selected one', () => {
    render(<Harness kind="tabs" />)
    const list = screen.getByRole('tablist', { name: 'View' })
    expect(list).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Map', 'Overview', 'Review', 'Notes 6'])
    expect(screen.getByRole('tab', { name: 'Map' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  })

  it('selects with a click', () => {
    const onChange = vi.fn()
    render(<Harness kind="tabs" onChange={onChange} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }))
    expect(onChange).toHaveBeenCalledWith('overview')
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
  })

  it('keeps one tab in the tab order: the selected one', () => {
    render(<Harness kind="tabs" />)
    const stops = screen.getAllByRole('tab').filter((t) => t.tabIndex === 0)
    expect(stops).toHaveLength(1)
    expect(stops[0]).toHaveTextContent('Map')
  })

  it('names the panel a tab controls', () => {
    render(<Harness kind="tabs" options={[{ value: 'map', label: 'Map', controls: 'map-panel' }, { value: 'overview', label: 'Overview' }]} />)
    expect(screen.getByRole('tab', { name: 'Map' })).toHaveAttribute('aria-controls', 'map-panel')
  })
})

describe('Segmented as a choice', () => {
  it('exposes a radiogroup of radios, and checks the selected one', () => {
    render(<Harness kind="choice" />)
    expect(screen.getByRole('radiogroup', { name: 'View' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Map' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Overview' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('checks with a click', () => {
    const onChange = vi.fn()
    render(<Harness kind="choice" onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Overview' }))
    expect(onChange).toHaveBeenCalledWith('overview')
    expect(screen.getByRole('radio', { name: 'Overview' })).toHaveAttribute('aria-checked', 'true')
  })
})

describe.each(['tabs', 'choice'] as const)('Segmented keys (%s)', (kind) => {
  const segment = (name: string | RegExp) => screen.getByRole(kind === 'tabs' ? 'tab' : 'radio', { name })

  it('moves with the arrow keys, takes focus and selection along, and wraps', () => {
    const onChange = vi.fn()
    render(<Harness kind={kind} onChange={onChange} />)
    segment('Map').focus()
    fireEvent.keyDown(segment('Map'), { key: 'ArrowRight' })
    expect(segment('Overview')).toHaveFocus()
    expect(onChange).toHaveBeenLastCalledWith('overview')
    fireEvent.keyDown(segment('Overview'), { key: 'ArrowLeft' })
    expect(segment('Map')).toHaveFocus()
    // Left of the first goes to the last enabled one.
    fireEvent.keyDown(segment('Map'), { key: 'ArrowLeft' })
    expect(segment(/^Notes/)).toHaveFocus()
    fireEvent.keyDown(segment(/^Notes/), { key: 'ArrowRight' })
    expect(segment('Map')).toHaveFocus()
  })

  it('skips a disabled segment', () => {
    const onChange = vi.fn()
    render(<Harness kind={kind} onChange={onChange} />)
    segment('Overview').focus()
    fireEvent.click(segment('Overview'))
    fireEvent.keyDown(segment('Overview'), { key: 'ArrowRight' })
    // Review is disabled, so the key lands on Notes.
    expect(segment(/^Notes/)).toHaveFocus()
    expect(onChange).toHaveBeenLastCalledWith('notes')
    expect(onChange).not.toHaveBeenCalledWith('review')
    fireEvent.keyDown(segment(/^Notes/), { key: 'ArrowLeft' })
    expect(segment('Overview')).toHaveFocus()
    expect(segment('Review')).toBeDisabled()
    fireEvent.click(segment('Review'))
    expect(onChange).not.toHaveBeenCalledWith('review')
  })

  it('jumps to the ends with Home and End, and also answers the vertical arrows', () => {
    render(<Harness kind={kind} />)
    segment('Map').focus()
    fireEvent.keyDown(segment('Map'), { key: 'End' })
    expect(segment(/^Notes/)).toHaveFocus()
    fireEvent.keyDown(segment(/^Notes/), { key: 'Home' })
    expect(segment('Map')).toHaveFocus()
    fireEvent.keyDown(segment('Map'), { key: 'ArrowDown' })
    expect(segment('Overview')).toHaveFocus()
    fireEvent.keyDown(segment('Overview'), { key: 'ArrowUp' })
    expect(segment('Map')).toHaveFocus()
  })

  it('does not report a click on the segment that is already selected', () => {
    const onChange = vi.fn()
    render(<Harness kind={kind} onChange={onChange} />)
    fireEvent.click(segment('Map'))
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(segment('Overview'))
    fireEvent.click(segment('Overview'))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('ignores keys with a modifier', () => {
    const onChange = vi.fn()
    render(<Harness kind={kind} onChange={onChange} />)
    segment('Map').focus()
    fireEvent.keyDown(segment('Map'), { key: 'ArrowRight', metaKey: true })
    expect(segment('Map')).toHaveFocus()
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('Segmented counts', () => {
  it('shows a count inside its segment, and the count is part of the name', () => {
    render(<Harness kind="tabs" />)
    const notes = screen.getByRole('tab', { name: 'Notes 6' })
    expect(notes).toHaveTextContent('Notes 6')
  })
})
