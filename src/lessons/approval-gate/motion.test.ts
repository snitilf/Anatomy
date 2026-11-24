import { describe, expect, it } from 'vitest'
import { CARD, LIFT, REACH_GATE, REACH_LEDGER, REACH_LOCK, SHUTTER_LIFT, TRAVEL_END } from './geometry'
import { canEdit, initialState, step, type LessonEvent, type LessonState } from './model'
import {
  IN_OUT,
  OUT,
  PIN_CLEAR,
  cubicBezier,
  fingerOf,
  isOpacity,
  isStepped,
  keyAlphaOf,
  keyLiftOf,
  pinOf,
  planRun,
  poseAt,
  restFor,
  restPose,
  type Channel,
  type Pose,
  type Run,
} from './motion'

const EVENTS: LessonEvent[] = ['approve', 'reject', 'edit', 'trySend', 'restart', 'reset']

/** A small seeded generator, so a failing sequence can be replayed. */
function random(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

function sequence(rand: () => number, length: number): LessonEvent[] {
  return Array.from({ length }, () => EVENTS[Math.floor(rand() * EVENTS.length)] ?? 'approve')
}

/** Plays an event from a pose, the way the lesson does. An edit past version 8 does nothing. */
function play(event: LessonEvent, state: LessonState, from: Pose, reduced = false) {
  if (event === 'edit' && !canEdit(state)) return null
  const next = step(state, event)
  return { next, run: planRun(event, state, next, from, reduced) }
}

const end = (run: Run) => poseAt(run, run.duration + 1)
const rest0 = () => restPose(initialState, 'home')

/**
 * The world units one unit of a channel moves. The fastest planned move, the pusher coming home, covers about 17 units in one frame.
 * A snap is a whole distance at once: the shortest, the lockout stop, is 14 units from home, and the rest are 43 and more.
 */
const UNITS: Partial<Record<string, number>> = { card: 1, push: 1, tabSlot: 6, outboxDrop: 1, shutter: SHUTTER_LIFT, bumpLock: 1, bumpFinger: 1, bumpPin: 1 }
const unitsOf = (channel: Channel) => (/^(finger|pin)\d$/.test(channel) ? LIFT : /^keyLift/.test(channel) ? 12 : (UNITS[channel] ?? 0))

describe('cubicBezier', () => {
  it('starts at 0, ends at 1, and rises in between', () => {
    for (const ease of [OUT, IN_OUT]) {
      expect(ease(0)).toBe(0)
      expect(ease(1)).toBe(1)
      let last = 0
      for (let i = 1; i <= 100; i++) {
        const value = ease(i / 100)
        expect(value).toBeGreaterThanOrEqual(last)
        last = value
      }
    }
  })

  it('matches the browser value at the middle of the in-out curve', () => {
    expect(cubicBezier(0.65, 0, 0.35, 1)(0.5)).toBeCloseTo(0.5, 3)
    // The browser gives cubic-bezier(0.25, 0.1, 0.25, 1) = 0.8024 at x = 0.5.
    expect(cubicBezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024, 3)
  })
})

describe('the rest invariant', () => {
  it('ends every run at the rest pose of the model state', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const rand = random(seed)
      let state = initialState
      let pose = rest0()
      for (const event of sequence(rand, 1 + Math.floor(rand() * 12))) {
        const played = play(event, state, pose)
        if (!played) continue
        state = played.next
        pose = end(played.run)
        expect(pose, `seed ${seed} after ${event}`).toEqual(restPose(state, restFor(event, state)))
        for (let v = 1; v <= 8; v++) {
          expect(pose[fingerOf(v)]).toBe(state.approvedVersion === v ? 1 : 0)
          expect(pose[pinOf(v)]).toBe(state.sent.includes(v) ? 1 : 0)
        }
        expect(pose.shutter).toBe(state.decision === 'rejected' ? 1 : 0)
        expect(Array.from({ length: 8 }, (_, i) => pose[keyAlphaOf(i + 1)]).filter((a) => a === 1)).toHaveLength(state.approvedVersion === null ? 0 : 1)
        expect(pose.tabSlot).toBe(state.version)
        expect(pose.outboxVersion).toBe(state.sent.at(-1) ?? 0)
      }
    }
  })

  it('leaves a blocked card resting against the blocker that stopped it', () => {
    const blocked = (events: LessonEvent[], reach: number) => {
      let state = initialState
      let pose = rest0()
      for (const event of events) {
        const played = play(event, state, pose)
        if (!played) continue
        state = played.next
        pose = end(played.run)
      }
      expect(pose.card).toBe(reach)
      expect(pose.push).toBe(reach)
    }
    blocked(['trySend'], REACH_GATE)
    blocked(['reject', 'trySend'], REACH_LOCK)
    blocked(['approve', 'trySend', 'trySend'], REACH_LEDGER)
  })
})

describe('no teleport while visible', () => {
  it('moves no visible part by more than 20 world units between two frames, even when an event cuts into a running run', () => {
    const frame = 1000 / 60
    for (let seed = 1; seed <= 300; seed++) {
      const rand = random(seed * 7919)
      let state = initialState
      let pose = rest0()
      for (const event of sequence(rand, 2 + Math.floor(rand() * 10))) {
        const played = play(event, state, pose)
        if (!played) continue
        const { next, run } = played
        // Sample the new run, starting from the pose the old run had reached.
        let last = pose
        for (let t = 0; t <= run.duration + frame; t += frame) {
          const now = poseAt(run, t)
          for (const channel of Object.keys(now) as Channel[]) {
            const units = unitsOf(channel)
            if (!units || isStepped(channel) || isOpacity(channel)) continue
            const cardPart = channel === 'card' || channel === 'tabSlot'
            // The card and its tab can change place while they are not drawn. On arrival the card is swapped for the outbox card in the same place. Everything else is always on screen.
            if (cardPart && Math.min(now.cardAlpha, last.cardAlpha) <= 0.05) continue
            expect(Math.abs(now[channel] - last[channel]) * units, `seed ${seed} ${event} ${channel} at ${Math.round(t)} ms`).toBeLessThan(20)
          }
          last = now
        }
        // The next event cuts in at a random moment, or after the run is over.
        const cut = rand() < 0.6 ? rand() * run.duration : run.duration + 1
        pose = poseAt(run, cut)
        state = next
      }
    }
  })
})

describe('commit timing', () => {
  const to = (events: LessonEvent[]) => events.reduce<{ state: LessonState; pose: Pose }>((acc, e) => {
    const played = play(e, acc.state, acc.pose)
    return played ? { state: played.next, pose: end(played.run) } : acc
  }, { state: initialState, pose: rest0() })

  it('commits a blocked send when the tab is at the blocker face', () => {
    for (const [events, reach] of [[[], REACH_GATE], [['reject'], REACH_LOCK], [['approve', 'trySend'], REACH_LEDGER]] as const) {
      const { state, pose } = to([...events])
      const played = play('trySend', state, pose)
      if (!played) throw new Error('no run')
      const commits = played.run.beats.filter((b) => b.kind === 'commit')
      expect(commits).toHaveLength(1)
      const at = poseAt(played.run, commits[0]?.at ?? 0)
      expect(at.card).toBeCloseTo(reach, 1)
    }
  })

  it('commits a sent version when the back edge of the card is past the pin', () => {
    const { state, pose } = to(['approve'])
    const played = play('trySend', state, pose)
    if (!played) throw new Error('no run')
    const commit = played.run.beats.find((b) => b.kind === 'commit')
    const at = poseAt(played.run, commit?.at ?? 0)
    expect(at.card).toBeGreaterThanOrEqual(PIN_CLEAR - 0.5)
    expect(at.card).toBeLessThan(TRAVEL_END)
    expect(CARD.x + at.card).toBeGreaterThan(46)
  })

  it('commits the other events at once', () => {
    for (const event of ['approve', 'reject', 'edit', 'restart', 'reset'] as const) {
      const played = play(event, initialState, rest0())
      if (!played) throw new Error('no run')
      expect(played.run.beats.filter((b) => b.kind === 'commit').map((b) => b.at)).toEqual([0])
    }
  })
})

describe('reduced motion', () => {
  it('gives every position a zero duration and keeps the fades short', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rand = random(seed * 31)
      let state = initialState
      let pose = rest0()
      for (const event of sequence(rand, 8)) {
        const played = play(event, state, pose, true)
        if (!played) continue
        for (const track of played.run.tracks) {
          if (isOpacity(track.channel)) expect(track.duration).toBeLessThanOrEqual(150)
          else expect(track.duration).toBe(0)
        }
        for (const beat of played.run.beats) expect(beat.at).toBe(0)
        state = played.next
        pose = end(played.run)
      }
    }
  })

  it('shows the frame that explains: a blocked send ends with the card at the stop', () => {
    const played = play('trySend', initialState, rest0(), true)
    if (!played) throw new Error('no run')
    expect(end(played.run).card).toBe(REACH_GATE)
  })
})

describe('delivery', () => {
  const to = (events: LessonEvent[]) =>
    events.reduce<{ state: LessonState; pose: Pose }>(
      (acc, e) => {
        const played = play(e, acc.state, acc.pose)
        return played ? { state: played.next, pose: end(played.run) } : acc
      },
      { state: initialState, pose: rest0() },
    )
  const secondSend = () => {
    const { state, pose } = to(['approve', 'trySend', 'edit', 'approve'])
    const played = play('trySend', state, pose)
    if (!played) throw new Error('no run')
    return played.run
  }

  it('never drives the card through the outbox card that is already there', () => {
    const run = secondSend()
    const backOfOutbox = CARD.x + TRAVEL_END
    let seen = false
    for (let t = 0; t <= run.duration; t += 5) {
      const pose = poseAt(run, t)
      if (pose.outboxAlpha > 0.05 && pose.cardAlpha > 0.05) {
        seen = true
        expect(CARD.x + CARD.w + pose.card, `at ${t} ms`).toBeLessThanOrEqual(backOfOutbox + 0.01)
      }
    }
    expect(seen).toBe(true)
  })

  it('sinks the previous outbox card on a beat, and has no such beat for the first delivery', () => {
    expect(secondSend().beats.filter((b) => b.kind === 'outboxOut')).toHaveLength(1)
    const { state, pose } = to(['approve'])
    const first = play('trySend', state, pose)
    expect(first?.run.beats.some((b) => b.kind === 'outboxOut')).toBe(false)
  })

  it('changes the stamp of the outbox card only while no outbox card is drawn', () => {
    const run = secondSend()
    let last = poseAt(run, 0)
    for (let t = 5; t <= run.duration; t += 5) {
      const now = poseAt(run, t)
      if (now.outboxVersion !== last.outboxVersion) expect(last.outboxAlpha, `at ${t} ms`).toBeLessThanOrEqual(0.05)
      last = now
    }
  })

  it('keeps the pusher out of the card at every moment the card is drawn', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rand = random(seed * 104729)
      let state = initialState
      let pose = rest0()
      for (const event of sequence(rand, 2 + Math.floor(rand() * 10))) {
        const played = play(event, state, pose)
        if (!played) continue
        for (let t = 0; t <= played.run.duration; t += 8) {
          const now = poseAt(played.run, t)
          if (now.cardAlpha > 0.05) expect(now.push, `seed ${seed} ${event} at ${t} ms`).toBeLessThanOrEqual(now.card + 0.01)
        }
        state = played.next
        pose = poseAt(played.run, rand() < 0.5 ? rand() * played.run.duration : played.run.duration + 1)
      }
    }
  })

  it('feeds the fresh card in only after the pusher has come home', () => {
    const { state, pose } = to(['approve'])
    const played = play('trySend', state, pose)
    if (!played) throw new Error('no run')
    let hidden = false
    for (let t = 0; t <= played.run.duration; t += 5) {
      const now = poseAt(played.run, t)
      if (now.cardAlpha <= 0.05) hidden = true
      else if (hidden) expect(now.push, `at ${t} ms`).toBeLessThanOrEqual(0.51)
    }
    expect(hidden).toBe(true)
  })
})

describe('edit, keys and reset', () => {
  const to = (events: LessonEvent[]) =>
    events.reduce<{ state: LessonState; pose: Pose }>(
      (acc, e) => {
        const played = play(e, acc.state, acc.pose)
        return played ? { state: played.next, pose: end(played.run) } : acc
      },
      { state: initialState, pose: rest0() },
    )
  const runOf = (setup: LessonEvent[], event: LessonEvent) => {
    const { state, pose } = to(setup)
    const played = play(event, state, pose)
    if (!played) throw new Error('no run')
    return { ...played, state }
  }
  const samples = (run: Run) => Array.from({ length: Math.ceil(run.duration / 5) + 2 }, (_, i) => poseAt(run, i * 5))

  it('keeps the card in place and fully drawn through an edit, and slides the tab to the next slot', () => {
    const { run, next } = runOf([], 'edit')
    const all = samples(run)
    for (const pose of all) {
      expect(pose.cardAlpha).toBe(1)
      expect(pose.card).toBe(0)
    }
    expect(end(run).tabSlot).toBe(next.version)
    const middle = all.filter((p) => p.tabSlot > 1.05 && p.tabSlot < 1.95)
    expect(middle.length).toBeGreaterThan(3)
  })

  it('swaps the stamp under a short dip, never while it is fully drawn', () => {
    const { run } = runOf([], 'edit')
    let last = poseAt(run, 0)
    for (const pose of samples(run)) {
      if (pose.cardVersion !== last.cardVersion) expect(last.stampAlpha).toBeLessThan(0.2)
      last = pose
    }
    expect(end(run).stampAlpha).toBe(1)
  })

  it('never shows two keys at full strength: the old key fades out as the new one drops in', () => {
    const { run } = runOf(['approve', 'edit'], 'approve')
    const old = samples(run).map((p) => p[keyAlphaOf(1)])
    const fresh = samples(run).map((p) => p[keyAlphaOf(2)])
    samples(run).forEach((_, i) => expect((old[i] ?? 0) + (fresh[i] ?? 0), `at ${i * 5} ms`).toBeLessThanOrEqual(1.0001))
    for (let i = 1; i < old.length; i++) {
      expect(old[i] ?? 0).toBeLessThanOrEqual((old[i - 1] ?? 0) + 1e-9)
      expect(fresh[i] ?? 0).toBeGreaterThanOrEqual((fresh[i - 1] ?? 0) - 1e-9)
    }
    expect(old.at(-1)).toBe(0)
    expect(fresh.at(-1)).toBe(1)
  })

  it('lifts a finger only once its key is nearly down: cause, then effect', () => {
    const { run } = runOf([], 'approve')
    const all = samples(run)
    const first = all.findIndex((p) => p.finger1 > 0.01)
    expect(first).toBeGreaterThan(0)
    expect(all[first]?.[keyLiftOf(1)]).toBeLessThan(0.1)
    expect(all[first]?.[keyAlphaOf(1)]).toBeGreaterThan(0.9)
  })

  it('fades the outbox card and the key out on reset, and never raises them', () => {
    const { run } = runOf(['approve', 'trySend'], 'reset')
    const all = samples(run)
    for (let i = 1; i < all.length; i++) {
      expect(all[i]?.outboxAlpha ?? 0).toBeLessThanOrEqual((all[i - 1]?.outboxAlpha ?? 0) + 1e-9)
      expect(all[i]?.[keyAlphaOf(1)] ?? 0).toBeLessThanOrEqual((all[i - 1]?.[keyAlphaOf(1)] ?? 0) + 1e-9)
    }
    expect(end(run).outboxAlpha).toBe(0)
  })
})
