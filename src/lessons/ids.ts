/**
 * The IDs of the lessons that ship with the app.
 * The catalog and the `anatomy` command line tool both read this list, so a board gets the same lesson warning in both.
 * This file must stay free of React, because the command line tool runs in Node without a bundler.
 */
export const LESSON_IDS = ['approval-gate'] as const

export type LessonId = (typeof LESSON_IDS)[number]
