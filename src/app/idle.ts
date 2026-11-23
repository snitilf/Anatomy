/**
 * Runs `work` once the first paint is behind the page: after the load event, two animation frames, and then a moment
 * when the browser is idle. Where there is no idle callback, a second later.
 */
export function whenIdle(work: () => void): void {
  const afterPaint = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if ('requestIdleCallback' in window) window.requestIdleCallback(work)
        else setTimeout(work, 1000)
      })
    })
  }
  if (document.readyState === 'complete') afterPaint()
  else window.addEventListener('load', afterPaint, { once: true })
}
