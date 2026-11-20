import type { ComponentType } from 'react'
import { LESSON_IDS, type LessonId } from './ids'

export { LESSON_IDS }

/** A reviewed lesson that ships with the app. Board files name lessons by ID only. */
export interface LessonEntry {
  id: LessonId
  title: string
  /** One sentence shown before the lesson opens. */
  summary: string
  load: () => Promise<{ default: ComponentType }>
}

// Keyed by ID, so the type check fails when an ID in ids.ts has no entry here.
const ENTRIES: Record<LessonId, Omit<LessonEntry, 'id'>> = {
  'approval-gate': {
    title: 'Approval gate',
    summary: 'Why an approval belongs to one exact message, and why a saved record stops a second send.',
    load: () => import('./approval-gate/ApprovalGateLesson'),
  },
}

export const LESSONS: readonly LessonEntry[] = LESSON_IDS.map((id) => ({ id, ...ENTRIES[id] }))

export function findLesson(id: string): LessonEntry | undefined {
  return LESSONS.find((l) => l.id === id)
}
