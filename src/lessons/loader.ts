import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { LESSONS, findLesson, type LessonEntry } from './catalog'

// A lesson loads once. A lazy component that is created again on every open would suspend again, even with its chunk in the cache,
// and the dialog would flash a loading line and jump in height. So the component is made once, and a loaded one renders at once.
const loaded = new Map<string, ComponentType>()
const lazies = new Map<string, LazyExoticComponent<ComponentType>>()

export function lessonComponent(entry: LessonEntry): ComponentType {
  const ready = loaded.get(entry.id)
  if (ready) return ready
  let component = lazies.get(entry.id)
  if (!component) {
    component = lazy(() =>
      entry.load().then((module) => {
        loaded.set(entry.id, module.default)
        return module
      }),
    )
    lazies.set(entry.id, component)
  }
  return component
}

/** Starts loading a lesson so that the first open finds it ready. Call it when the person is about to open it. */
export function preloadLesson(id: string) {
  const entry = findLesson(id)
  if (!entry || loaded.has(id)) return
  void entry.load().then((module) => void loaded.set(id, module.default), () => {})
}

// The lesson scripts are small and separate from the first script. When the browser is idle after the app starts, fetch them,
// so that opening a lesson shows it at once. Browsers without idle callbacks load on the first open.
if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
  window.requestIdleCallback(() => {
    for (const lesson of LESSONS) preloadLesson(lesson.id)
  })
}
