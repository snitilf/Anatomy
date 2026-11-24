/** An element that can take focus now: no inert or hidden container above it, drawn, and not made invisible. */
function usable(el: HTMLElement): boolean {
  return !el.closest('[inert], [hidden]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
}

/** Also on the screen: not in the phone sheet at its lowest stop, where everything but the header is below the screen. */
function onScreen(el: HTMLElement): boolean {
  return usable(el) && !el.closest('[data-stop="0"]')
}

const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)]

/**
 * Where focus can go when a lesson closes, best first:
 * the row that opened it, as it stands now, then the panel heading, then the first control of the panel
 * (the sheet header at its lowest stop), then the Overview page, then the control that shows a hidden sidebar, then Search.
 * A row below the fold of a scrolling panel counts: focus scrolls to it.
 */
export function focusTargets(part: string): HTMLElement[] {
  const rows = all('[data-lesson-opener]').filter((el) => el.dataset.lessonOpener === part && onScreen(el))
  const headings = all('[data-testid="inspector"] h2[tabindex="-1"]').filter(onScreen)
  const panel = all('[data-testid="inspector"] button').filter(usable)
  const overview = all('[data-testid="overview"]').filter(usable)
  const show = all('button[aria-label="Show sidebar"]').filter(usable)
  const search = all('button[aria-label="Search"]').filter(usable)
  return [...rows, ...headings, ...panel, ...overview, ...show, ...search]
}

/** Focuses the best target that takes it. With `onlyIfLost`, does nothing while focus is already somewhere in the page. */
export function returnFocus(part: string, onlyIfLost = false): HTMLElement | undefined {
  const active = document.activeElement
  if (onlyIfLost && active && active !== document.body) return undefined
  for (const target of focusTargets(part)) {
    target.focus()
    if (document.activeElement === target) return target
  }
  return undefined
}
