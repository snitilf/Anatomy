import { describe, expect, it } from 'vitest'
import { agentReadme, keepReadme, README_MARK } from './agentReadme'

describe('keeping an existing README', () => {
  it('keeps one the user wrote, and one that is already current', () => {
    expect(keepReadme('# My own notes about Anatomy')).toBe(true)
    expect(keepReadme(agentReadme())).toBe(true)
  })

  it('replaces an older one that carries the mark', () => {
    expect(keepReadme(`${README_MARK}\n\n# Anatomy\n\nAn older format.`)).toBe(false)
  })

  it('marks one that is exactly the text Anatomy writes, minus the first line', () => {
    const plain = agentReadme().slice(README_MARK.length).replace(/^\n+/, '')
    expect(plain.startsWith('# Anatomy')).toBe(true)
    expect(keepReadme(plain)).toBe(false)
    // A plain file the user edited is theirs.
    expect(keepReadme(`${plain}\nMy own line.`)).toBe(true)
  })
})
