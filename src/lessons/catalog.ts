import type { ComponentType } from 'react'

/** A reviewed lesson that ships with the app. Board files name lessons by ID only. */
export interface LessonEntry {
  id: string
  title: string
  /** One sentence shown before the lesson opens. */
  summary: string
  load: () => Promise<{ default: ComponentType }>
}

export const LESSONS: readonly LessonEntry[] = [
  {
    id: 'approval-gate',
    title: 'Approval gate',
    summary: 'Why an approval belongs to one exact message, and why a saved record stops a second send.',
    load: () => import('./approval-gate/ApprovalGateLesson'),
  },
]

export const LESSON_IDS: readonly string[] = LESSONS.map((l) => l.id)

export function findLesson(id: string): LessonEntry | undefined {
  return LESSONS.find((l) => l.id === id)
}
