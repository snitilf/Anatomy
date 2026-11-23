import { describe, expect, it, vi } from 'vitest'
import { LIMITS } from '../board/schema'
import { parseOpenedFile } from '../layer/files'
import { readFileText } from './openFile'

/** A file that reports a size and fails the test if anything reads its content. */
function fakeFile(size: number, name = 'big.json') {
  const text = vi.fn(async () => {
    throw new Error('The content must not be read.')
  })
  return { file: { name, size, text } as unknown as File, text }
}

const tooBig = (bytes: number) => {
  const result = parseOpenedFile('x'.repeat(bytes))
  if (result.ok) throw new Error('expected a failure')
  return result.errors[0]!.message
}

describe('readFileText', () => {
  it.each([LIMITS.fileBytes * 2 + 1, 300_000_000])('does not read a %i byte file, and gives the message the app gives for a file that is too large', async (size) => {
    const { file, text } = fakeFile(size)
    const result = await readFileText(file)
    expect(text).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toBe(tooBig(size))
    expect(result.message).toMatch(/MB\. Anatomy opens files up to 2 MB\.$/)
  })

  it('reads a file at the limit as before', async () => {
    const file = new File(['{"a":1}'], 'ok.json')
    Object.defineProperty(file, 'size', { value: LIMITS.fileBytes * 2 })
    const text = vi.spyOn(file, 'text')
    expect(await readFileText(file)).toEqual({ ok: true, text: '{"a":1}' })
    expect(text).toHaveBeenCalledTimes(1)
  })

  it('still reports a file that cannot be read', async () => {
    const file = { name: 'x.json', size: 10, text: async () => Promise.reject(new Error('gone')) } as unknown as File
    expect(await readFileText(file)).toEqual({ ok: false, message: 'The file could not be read.' })
  })
})
