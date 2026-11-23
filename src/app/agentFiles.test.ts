import { describe, expect, it, vi } from 'vitest'

vi.mock('./agentReadme', () => {
  throw new Error('Failed to fetch dynamically imported module')
})

describe('writeAgentFiles when the text of the README cannot load', () => {
  it('does not reject, so Send still writes feedback.json', async () => {
    const { writeAgentFiles } = await import('./agentFiles')
    const write = vi.fn().mockResolvedValue(true)
    await expect(writeAgentFiles(write)).resolves.toBeUndefined()
    // The README, the guide, and the schema are skipped. Nothing else changes.
    expect(write.mock.calls.map((c) => c[0])).not.toContain('README.md')
  })
})
