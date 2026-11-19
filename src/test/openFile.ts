import { fireEvent } from '@testing-library/react'

/** Opens board text through the file picker, the way a person opens a board file from disk. */
export function openBoardFile(text: string, name = 'board.json') {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [new File([text], name, { type: 'application/json' })] } })
}
