import { useEffect } from 'react'
import { summaryTotal } from '../layer/revisionSummary'
import { useAppStore } from './store'

/** The title of the tab with a count in front while things wait: "(3) Anatomy". Past 99 it reads "(99+)". */
export function tabTitle(base: string, count: number): string {
  if (count <= 0) return base
  return `(${count > 99 ? '99+' : count}) ${base}`
}

/** Keeps the count of the revision that waits for review in the title of the tab, so it shows while the user is elsewhere. */
export function useTabTitle(): void {
  const count = useAppStore((s) => (s.revisionNotice ? summaryTotal(s.revisionNotice) : 0))
  useEffect(() => {
    const base = document.title.replace(/^\((?:\d+|99\+)\) /, '')
    document.title = tabTitle(base, count)
    return () => {
      document.title = base
    }
  }, [count])
}
