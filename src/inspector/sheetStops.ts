import type { UiState } from '../app/ui'

type Stop = UiState['sheet']

/** Faster than this, in px per ms, a release goes on to the next stop in that direction. */
export const FLICK = 0.11
/** Only pointer samples this recent, in ms, count toward the release velocity. */
export const FLICK_WINDOW = 100

export type Sample = { y: number; t: number }

/** The finger's speed at release in px per ms, downward positive, over the last 100 ms only. `y` is where the finger lifts. */
export function releaseVelocity(samples: readonly Sample[], now: number, y: number): number {
  const first = samples.find((x) => now - x.t <= FLICK_WINDOW)
  return first && now > first.t ? (y - first.y) / (now - first.t) : 0
}

/**
 * The stop a release settles on. `y` is where the finger lifts and `at` is where the sheet sits when the finger lifts and `offsets` is the sheet's offset at each stop.
 * A flick goes to the next stop in its direction, or stays at the last one. A slower release goes to the nearest stop.
 */
export function settleStop(samples: readonly Sample[], now: number, y: number, at: number, offsets: Record<Stop, number>): Stop {
  const velocity = releaseVelocity(samples, now, y)
  const stops = ([0, 1, 2] as const).map((s) => ({ s, y: offsets[s] }))
  if (Math.abs(velocity) > FLICK) {
    const ahead = stops.filter((x) => (velocity > 0 ? x.y > at : x.y < at)).sort((a, b) => Math.abs(a.y - at) - Math.abs(b.y - at))
    return ahead[0]?.s ?? (velocity > 0 ? 0 : 2)
  }
  return stops.reduce((best, x) => (Math.abs(x.y - at) < Math.abs(best.y - at) ? x : best)).s
}
