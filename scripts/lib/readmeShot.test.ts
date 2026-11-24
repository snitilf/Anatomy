import { describe, expect, it } from 'vitest'
import { EXAMPLES } from '../../src/app/examples.ts'
import { readShot } from './readmeShot.ts'

describe('readShot', () => {
  it('uses the README picture when no option is given', () => {
    const { shot, out } = readShot([])
    expect(shot.example.test('How the Claude Code harness works What happens between your prompt')).toBe(true)
    expect(shot.walkthrough).toBe('Fix a failing test')
    expect(shot.step).toBe(2)
    expect(out).toBeUndefined()
  })

  it('finds every built-in example by its id, which is what the usage line shows', () => {
    for (const example of EXAMPLES) {
      const { shot } = readShot(['--example', example.id])
      expect(shot.example.test(`${example.title} ${example.description}`), example.id).toBe(true)
      for (const other of EXAMPLES.filter((o) => o !== example)) expect(shot.example.test(other.title), `${example.id} vs ${other.id}`).toBe(false)
    }
  })

  it('finds an example by a part of its title, ignoring case, and treats the text as plain text', () => {
    expect(readShot(['--example', 'ANATOMY ITSELF']).shot.example.test('Anatomy itself')).toBe(true)
    expect(readShot(['--example', 'language model']).shot.example.test(EXAMPLES[2]!.title)).toBe(true)
    expect(() => readShot(['--example', '.*'])).toThrow(/No built-in example/)
  })

  it('names the ids when no example matches', () => {
    expect(() => readShot(['--example', 'nope'])).toThrow(/claude-code, anatomy, llm/)
  })

  it('reads the step and the window size as positive whole numbers', () => {
    const { shot } = readShot(['--step', '4', '--width', '1200', '--height', '760', '--hide-sidebar', '--out', 'scratch/shots'])
    expect(shot).toMatchObject({ step: 4, width: 1200, height: 760, hideSidebar: true })
    for (const name of ['step', 'width', 'height']) {
      for (const bad of ['0', '-3', '1.5', 'abc', '']) {
        expect(() => readShot([`--${name}`, bad]), `--${name} ${JSON.stringify(bad)}`).toThrow(new RegExp(`--${name}`))
      }
    }
  })
})
