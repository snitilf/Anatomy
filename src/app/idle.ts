/** Runs `work` when the browser has nothing else to do, or a moment after the page loads where it has no idle callback. */
export function whenIdle(work: () => void): void {
  if ('requestIdleCallback' in window) window.requestIdleCallback(work)
  else setTimeout(work, 1000)
}
