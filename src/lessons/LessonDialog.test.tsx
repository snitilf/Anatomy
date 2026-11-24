import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { LessonDialog } from './LessonDialog'

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
})

describe('LessonDialog', () => {
  // This is the first test of the file to open a lesson, so the lesson is not loaded yet and the loading text shows once.
  it('opens modally and shows the loading text on a cold cache, then the lesson', async () => {
    render(<LessonDialog lessonId="approval-gate" onClose={() => {}} />)
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled()
    expect(screen.getByText('Loading lesson')).toBeInTheDocument()
    expect(await screen.findByText('Where the analogy stops', {}, { timeout: 5000 })).toBeInTheDocument()
  })

  it('opens a lesson that has already loaded without the loading text', async () => {
    const { unmount } = render(<LessonDialog lessonId="approval-gate" onClose={() => {}} />)
    expect(await screen.findByText('Where the analogy stops', {}, { timeout: 5000 })).toBeInTheDocument()
    unmount()
    render(<LessonDialog lessonId="approval-gate" onClose={() => {}} />)
    expect(screen.queryByText('Loading lesson')).not.toBeInTheDocument()
    expect(screen.getByText('Where the analogy stops')).toBeInTheDocument()
  })

  it('says so for an unknown lesson', () => {
    render(<LessonDialog lessonId="nope" onClose={() => {}} />)
    expect(screen.getByText('This lesson is not available')).toBeInTheDocument()
  })

  it('closes from the Close button and from Escape', () => {
    const onClose = vi.fn()
    const { container } = render(<LessonDialog lessonId="nope" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }, ))
    expect(onClose).toHaveBeenCalledTimes(1)
    const dialog = container.querySelector('dialog')
    if (!dialog) throw new Error('no dialog')
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
