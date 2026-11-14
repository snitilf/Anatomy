import type { Feedback, FeedbackItem } from './types'

/** The rows of the send summary, in this order. */
const KINDS: readonly { label: string; types: readonly FeedbackItem['type'][] }[] = [
  { label: 'Notes', types: ['note'] },
  { label: 'Questions', types: ['question'] },
  { label: 'Links', types: ['link'] },
  { label: 'New parts', types: ['new-part'] },
  { label: 'Moved connections', types: ['reconnect'] },
  { label: 'Drawings and shapes', types: ['drawing', 'shape', 'arrow'] },
  { label: 'Text and sticky notes', types: ['text', 'sticky'] },
]

/** One row per kind of item the feedback holds, with its count. Kinds with nothing in them are left out. */
export function summarize(feedback: Pick<Feedback, 'items' | 'withdrawn'>): { label: string; count: number }[] {
  const rows = KINDS.map(({ label, types }) => ({ label, count: feedback.items.filter((i) => types.includes(i.type)).length }))
  rows.push({ label: 'Deleted since last send', count: feedback.withdrawn.length })
  return rows.filter((r) => r.count > 0)
}
