/**
 * The fastest time, in milliseconds, of up to `runs` runs after one warm-up run. It stops early once a run is inside the budget.
 *
 * A busy machine only ever adds time, so the fastest run is the honest one: a quiet machine passes on the first run,
 * and a loaded machine gets more tries to land one run without a pause. A real slowdown fails every run, so it still fails.
 */
export function fastestMs(run: () => unknown, budgetMs: number, runs = 25): number {
  run()
  let best = Infinity
  for (let i = 0; i < runs && best >= budgetMs; i++) {
    const start = performance.now()
    run()
    best = Math.min(best, performance.now() - start)
  }
  return best
}
