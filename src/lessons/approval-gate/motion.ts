/**
 * The timeline of the dispatch press. Pure: no React, no DOM, no clock.
 *
 * A run is a list of tracks. Each track moves one channel of the pose from one value to another with a cubic-bezier curve.
 * `planRun` builds the run for one event, starting from whatever pose is on screen, so an interrupted run is never snapped:
 * every channel retargets from its current value. `poseAt` reads the pose at a time. Beats mark the moments the page reacts to.
 */
import { CARD, PIN_FACE, PIN_R, REACH_GATE, REACH_LEDGER, REACH_LOCK, SLOTS, TRAVEL_END } from './geometry'
import { type LessonEvent, type LessonState } from './model'
import { stopOf } from './scene'

export type Ease = (t: number) => number

/** A cubic-bezier curve like the CSS one: a Newton solve with a bisection fallback. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Ease {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  return (x) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 8; i++) {
      const error = sampleX(t) - x
      if (Math.abs(error) < 1e-7) return sampleY(t)
      const slope = slopeX(t)
      if (Math.abs(slope) < 1e-6) break
      t -= error / slope
    }
    let lo = 0
    let hi = 1
    t = x
    for (let i = 0; i < 48; i++) {
      const value = sampleX(t)
      if (Math.abs(value - x) < 1e-7) break
      if (value < x) lo = t
      else hi = t
      t = (lo + hi) / 2
    }
    return sampleY(t)
  }
}

/** The app's `--ease-out`. Things that enter or settle. */
export const OUT = cubicBezier(0.23, 1, 0.32, 1)
/** Things that move across the screen and land. */
export const IN_OUT = cubicBezier(0.65, 0, 0.35, 1)
/** Gravity: a falling pin or bar accelerates. */
export const FALL = cubicBezier(0.5, 0, 0.75, 0)
/** A push that keeps its speed into the stop, so the contact reads as a hit. */
export const PUSH = cubicBezier(0.5, 0, 0.85, 0.6)

const clamp = (low: number, value: number, high: number) => Math.min(high, Math.max(low, value))
const round = (ms: number) => Math.round(ms)
/** The time a push or a delivery takes grows with its distance, so short and long trips feel like one machine. */
export const travelMs = (distance: number) => round(clamp(300, 220 + 2.4 * distance, 760))
/** A return is a reset, not the explanation, so it is quick. */
export const returnMs = (distance: number) => round(clamp(240, 200 + 1.4 * distance, 440))

export type Slot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
export type Channel =
  | 'card'
  | 'push'
  | 'cardAlpha'
  | 'stampAlpha'
  | 'cardVersion'
  | 'tabSlot'
  | 'outboxAlpha'
  | 'outboxDrop'
  | 'outboxVersion'
  | 'shutter'
  | 'power'
  | 'dim'
  | 'bumpLock'
  | 'bumpFinger'
  | 'bumpPin'
  | `finger${Slot}`
  | `pin${Slot}`
  | `keyLift${Slot}`
  | `keyAlpha${Slot}`

export type Pose = Record<Channel, number>

const SLOT_LIST = Array.from({ length: SLOTS }, (_, i) => (i + 1) as Slot)
export const fingerOf = (v: number) => `finger${v as Slot}` as const
export const pinOf = (v: number) => `pin${v as Slot}` as const
export const keyLiftOf = (v: number) => `keyLift${v as Slot}` as const
export const keyAlphaOf = (v: number) => `keyAlpha${v as Slot}` as const

/** Channels that fade. Every other channel is a position, a version number, or a switch. */
const OPACITY = new Set<Channel>(['cardAlpha', 'stampAlpha', 'outboxAlpha', 'dim', ...SLOT_LIST.map(keyAlphaOf)])
/** Channels that hold a whole number, which change in one step. */
const STEPPED = new Set<Channel>(['cardVersion', 'outboxVersion'])
export const isOpacity = (channel: Channel) => OPACITY.has(channel)
export const isStepped = (channel: Channel) => STEPPED.has(channel)

export type CardRest = 'home' | 'lockout' | 'gate' | 'ledger'

const REACH: Record<CardRest, number> = { home: 0, lockout: REACH_LOCK, gate: REACH_GATE, ledger: REACH_LEDGER }
export const reachFor = (rest: CardRest) => REACH[rest]

/** Where the card rests after an event: against its blocker after a send that was blocked, at home otherwise. */
export function restFor(event: LessonEvent, state: LessonState): CardRest {
  if (event !== 'trySend') return 'home'
  const stop = stopOf(state.lastOutcome)
  return stop === 'lockout' || stop === 'gate' || stop === 'ledger' ? stop : 'home'
}

/** The pose the picture holds when nothing moves. */
export function restPose(state: LessonState, rest: CardRest): Pose {
  const last = state.sent.at(-1) ?? 0
  const pose = {
    card: REACH[rest],
    push: REACH[rest],
    cardAlpha: 1,
    stampAlpha: 1,
    cardVersion: state.version,
    tabSlot: state.version,
    outboxAlpha: last ? 1 : 0,
    outboxDrop: 0,
    outboxVersion: last,
    shutter: state.decision === 'rejected' ? 1 : 0,
    power: 1,
    dim: 0,
    bumpLock: 0,
    bumpFinger: 0,
    bumpPin: 0,
  } as Pose
  for (const v of SLOT_LIST) {
    const approved = state.approvedVersion === v
    pose[fingerOf(v)] = approved ? 1 : 0
    pose[pinOf(v)] = state.sent.includes(v) ? 1 : 0
    pose[keyLiftOf(v)] = approved ? 0 : 1
    pose[keyAlphaOf(v)] = approved ? 1 : 0
  }
  return pose
}

export interface Track {
  channel: Channel
  from: number
  to: number
  /** Milliseconds from the start of the run. */
  start: number
  duration: number
  ease: Ease
}

/** A moment the page reacts to. The press itself is driven by tracks only. */
export interface Beat {
  at: number
  /** `commit`: the caption, readout and lit part switch to the run's state. `deliver`: a card is delivered. `outboxOut`: the previous outbox card leaves. */
  kind: 'commit' | 'deliver' | 'outboxOut'
}

export interface Run {
  from: Pose
  end: Pose
  tracks: Track[]
  beats: Beat[]
  /** The state that the commit beat shows. */
  state: LessonState
  duration: number
}

class Plan {
  tracks: Track[] = []
  beats: Beat[] = []
  readonly from: Pose
  cur: Pose
  constructor(from: Pose) {
    this.from = from
    this.cur = { ...from }
  }

  /** Moves a channel from where the plan has left it. Tracks on one channel must start in order. */
  go(channel: Channel, to: number, start: number, duration: number, ease: Ease = OUT): Track | null {
    const from = this.cur[channel]
    if (from === to) return null
    const track = { channel, from, to, start, duration, ease }
    this.tracks.push(track)
    this.cur[channel] = to
    return track
  }

  /** The time the last track on a channel ends. */
  endOf(channel: Channel): number {
    let end = 0
    for (const track of this.tracks) if (track.channel === channel) end = Math.max(end, track.start + track.duration)
    return end
  }

  beat(at: number, kind: Beat['kind']) {
    this.beats.push({ at, kind })
  }
}

/** The time an eased track first reaches a value. The curves used for positions are monotone, so a bisection finds it. */
export function crossTime(track: Track, value: number): number {
  if (track.duration === 0) return track.start
  const rising = track.to >= track.from
  let lo = 0
  let hi = 1
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    const at = track.from + (track.to - track.from) * track.ease(mid)
    if (at < value === rising) lo = mid
    else hi = mid
  }
  return track.start + hi * track.duration
}

const FEED_FROM = 6
const LEAVE_MS = 180
/** How long the outbox card takes to fade to nothing you can see. The exit curve is front loaded, so it is well short of its whole duration. */
const LEAVE_CLEAR = (() => {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (1 - OUT(mid) > 0.05) lo = mid
    else hi = mid
  }
  return hi * LEAVE_MS
})()
/** A card that has travelled leaves when the back edge of its footprint is clear of the ledger pins. */
export const PIN_CLEAR = PIN_FACE + 2 * PIN_R - CARD.x + 0.5
const STOPS = [REACH_LOCK, REACH_GATE, REACH_LEDGER]

interface Formation {
  /** When the card is at home, fully drawn, and a send can start. */
  ready: number
  /** When the card is not drawn, so a pose change on it cannot be seen. Null while it is drawn. */
  hidden: number | null
}

/** Brings the card and the pusher back to the formation an event starts from, without a visible jump. */
function formUp(plan: Plan): Formation {
  const from = plan.from
  const visible = from.cardAlpha > 0.05
  if (visible && Math.abs(from.card) < 7) return { ready: 0, hidden: null }
  if (visible && STOPS.some((stop) => Math.abs(from.card - stop) < 2.5)) {
    const duration = returnMs(Math.max(from.card, from.push))
    plan.go('card', 0, 0, duration, IN_OUT)
    plan.go('push', 0, 0, duration, IN_OUT)
    return { ready: duration, hidden: null }
  }
  // The card is in flight, or it is not drawn. It fades out where it is, the pusher goes home, and a fresh card feeds in.
  let hidden = 0
  if (visible) {
    plan.go('cardAlpha', 0, 0, 100, OUT)
    hidden = 100
  }
  let home = 0
  if (Math.abs(from.push) > 0.5) {
    const back = plan.go('push', 0, 0, returnMs(Math.abs(from.push)), IN_OUT)
    if (back) home = crossTime(back, 0.5)
  }
  const feed = Math.max(hidden, home)
  plan.go('card', FEED_FROM, hidden, 0)
  plan.go('card', 0, feed, 240, OUT)
  plan.go('cardAlpha', 1, feed, 200, OUT)
  return { ready: feed + 240, hidden }
}

/** A new version: the tab slides to its slot, and the stamp is swapped under a short dip. The card itself stays put and drawn. */
function changeVersion(plan: Plan, version: number, hidden: number | null) {
  if (plan.cur.cardVersion === version && plan.cur.tabSlot === version) return
  if (hidden !== null) {
    plan.go('cardVersion', version, hidden, 0)
    plan.go('tabSlot', version, hidden, 0)
    return
  }
  plan.go('tabSlot', version, 0, 240, IN_OUT)
  plan.go('stampAlpha', 0, 0, 100, OUT)
  plan.go('cardVersion', version, 100, 0)
  plan.go('stampAlpha', 1, 100, 140, OUT)
}

/** The fingers, the keys, the shutter and the pins follow the decisions. */
function settleParts(plan: Plan, target: Pose, skipPin: number | null) {
  // A key that is still on screen leaves first. The key that replaces it starts once it is gone, so the two never add up to more than one.
  const leaving = SLOT_LIST.some((v) => target[keyAlphaOf(v)] < plan.cur[keyAlphaOf(v)] && plan.cur[keyAlphaOf(v)] > 0.05)
  const entry = leaving ? 100 : 0
  for (const v of SLOT_LIST) {
    const finger = fingerOf(v)
    const lift = keyLiftOf(v)
    const alpha = keyAlphaOf(v)
    if (target[alpha] > plan.cur[alpha]) {
      // The key drops onto its finger, and then that finger lifts.
      if (plan.cur[alpha] <= 0.05) plan.go(lift, 1, entry, 0)
      plan.go(lift, 0, entry, 240, OUT)
      plan.go(alpha, 1, entry, 120, OUT)
    } else if (target[alpha] < plan.cur[alpha]) {
      plan.go(alpha, 0, 0, 160, OUT)
      plan.go(lift, 1, 0, 160, OUT)
    }
    if (plan.cur[finger] !== target[finger]) {
      if (target[finger] > plan.cur[finger]) plan.go(finger, 1, entry + 200, 260, IN_OUT)
      else plan.go(finger, 0, 0, 220, IN_OUT)
    }

    const pin = pinOf(v)
    if (v !== skipPin && plan.cur[pin] !== target[pin]) {
      if (target[pin] > plan.cur[pin]) plan.go(pin, 1, 0, 200, FALL)
      else plan.go(pin, 0, 0, 260, IN_OUT)
    }
  }
  if (plan.cur.shutter !== target.shutter) {
    if (target.shutter > plan.cur.shutter) plan.go('shutter', 1, 0, 240, FALL)
    else plan.go('shutter', 0, 0, 260, IN_OUT)
  }
}

/** The outbox card follows the record of sent versions. A send does its own, so this is for every other event. */
function settleOutbox(plan: Plan, target: Pose) {
  const swap = plan.cur.outboxVersion !== target.outboxVersion
  if (!swap) {
    plan.go('outboxAlpha', target.outboxAlpha, 0, 160, OUT)
    return
  }
  if (plan.cur.outboxAlpha > 0.05) {
    plan.go('outboxAlpha', 0, 0, 100, OUT)
    plan.go('outboxVersion', target.outboxVersion, 100, 0)
    plan.go('outboxAlpha', target.outboxAlpha, 100, target.outboxAlpha > 0 ? 140 : 0, OUT)
  } else {
    plan.go('outboxVersion', target.outboxVersion, 0, 0)
    plan.go('outboxAlpha', target.outboxAlpha, 0, 150, OUT)
  }
}

function planBlocked(plan: Plan, next: LessonState, t0: number) {
  const stop = stopOf(next.lastOutcome)
  if (stop !== 'lockout' && stop !== 'gate' && stop !== 'ledger') return
  const reach = REACH[stop]
  const approach = travelMs(reach - plan.cur.card)
  plan.go('card', reach, t0, approach, PUSH)
  plan.go('push', reach, t0, approach, PUSH)
  const contact = t0 + approach
  plan.beat(contact, 'commit')
  // The card rebounds a little and rests in contact. The blocker shudders.
  plan.go('card', reach - 1.2, contact, 80, OUT)
  plan.go('push', reach - 1.2, contact, 80, OUT)
  plan.go('card', reach, contact + 80, 160, IN_OUT)
  plan.go('push', reach, contact + 80, 160, IN_OUT)
  const bump = stop === 'lockout' ? 'bumpLock' : stop === 'gate' ? 'bumpFinger' : 'bumpPin'
  plan.go(bump, 0.5, contact, 70, OUT)
  plan.go(bump, 0, contact + 70, 110, IN_OUT)
}

function planSent(plan: Plan, next: LessonState, t0: number) {
  const duration = travelMs(TRAVEL_END - plan.cur.card)
  const travel = plan.go('card', TRAVEL_END, t0, duration, IN_OUT)
  plan.go('push', TRAVEL_END, t0, duration, IN_OUT)
  const deliver = travel ? crossTime(travel, PIN_CLEAR) : t0
  plan.beat(deliver, 'deliver')
  plan.beat(deliver, 'commit')
  plan.go(pinOf(next.version), 1, deliver, 200, FALL)
  if (travel && plan.cur.outboxAlpha > 0.05) {
    // The card already in the outbox sinks and fades when the new card's front passes the ledger pins,
    // early enough that it is gone before the front reaches its back edge.
    const pinsPassed = crossTime(travel, PIN_FACE + 2 * PIN_R - CARD.x - CARD.w)
    const touching = crossTime(travel, TRAVEL_END - CARD.w)
    const leave = Math.max(t0, Math.min(pinsPassed, touching - LEAVE_CLEAR - 10))
    plan.beat(leave, 'outboxOut')
    plan.go('outboxAlpha', 0, leave, LEAVE_MS, OUT)
    plan.go('outboxDrop', 2.5, leave, LEAVE_MS, OUT)
  }
  // The card arrives and becomes the outbox card. A fresh copy of it feeds in behind the pusher.
  const arrive = t0 + duration
  plan.go('outboxDrop', 0, arrive, 0)
  plan.go('outboxVersion', next.version, arrive, 0)
  plan.go('outboxAlpha', 1, arrive, 0)
  plan.go('cardAlpha', 0, arrive, 0)
  plan.go('card', FEED_FROM, arrive, 0)
  const back = plan.go('push', 0, arrive + 80, returnMs(TRAVEL_END), IN_OUT)
  const feed = back ? crossTime(back, 0.5) : arrive
  plan.go('card', 0, feed, 240, OUT)
  plan.go('cardAlpha', 1, feed, 200, OUT)
}

/** Reduced motion: no position moves. Only fades stay, and the end pose is the pose that explains the outcome. */
function compress(run: Run): Run {
  const tracks: Track[] = []
  for (const channel of Object.keys(run.end) as Channel[]) {
    const from = run.from[channel]
    const to = run.end[channel]
    if (from === to) continue
    const duration = channel === 'dim' ? 120 : isOpacity(channel) ? 150 : 0
    tracks.push({ channel, from, to, start: 0, duration, ease: OUT })
  }
  const beats = run.beats.map((beat) => ({ ...beat, at: 0 }))
  const duration = tracks.reduce((end, track) => Math.max(end, track.start + track.duration), 0)
  return { ...run, tracks, beats, duration }
}

/**
 * The run for one event. `from` is the pose on screen now, which can be the middle of an earlier run.
 * The run always ends at the rest pose of the new state.
 */
export function planRun(event: LessonEvent, _before: LessonState, next: LessonState, from: Pose, reduced: boolean): Run {
  const plan = new Plan(from)
  const target = restPose(next, restFor(event, next))
  const formation = formUp(plan)
  const sent = event === 'trySend' && next.lastOutcome === 'sent'

  if (event === 'trySend') {
    settleParts(plan, target, sent ? next.version : null)
    settleOutbox(plan, sent ? { ...target, outboxVersion: plan.cur.outboxVersion, outboxAlpha: plan.cur.outboxAlpha } : target)
    if (sent) planSent(plan, next, formation.ready)
    else planBlocked(plan, next, formation.ready)
  } else {
    changeVersion(plan, next.version, formation.hidden)
    settleParts(plan, target, null)
    settleOutbox(plan, target)
    if (event === 'restart') {
      plan.go('power', 0, 0, 140, OUT)
      plan.go('power', 1, 600, 140, OUT)
    }
  }
  if (plan.beats.every((beat) => beat.kind !== 'commit')) plan.beat(0, 'commit')

  // Whatever is still short of the rest pose, such as a channel an earlier run left half way, gets there now.
  for (const channel of Object.keys(target) as Channel[]) {
    if (plan.cur[channel] !== target[channel]) plan.go(channel, target[channel], plan.endOf(channel), isStepped(channel) ? 0 : 160, OUT)
  }

  plan.beats.sort((a, b) => a.at - b.at)
  const duration = Math.max(0, ...plan.tracks.map((track) => track.start + track.duration), ...plan.beats.map((beat) => beat.at))
  const run: Run = { from, end: plan.cur, tracks: plan.tracks, beats: plan.beats, state: next, duration }
  return reduced ? compress(run) : run
}

/** The pose at a time. Tracks on one channel run in order, so a later track starts from where the earlier one ended. */
export function poseAt(run: Run, time: number): Pose {
  const pose = { ...run.from }
  for (const track of run.tracks) {
    if (time < track.start) continue
    const progress = track.duration === 0 || time >= track.start + track.duration ? 1 : (time - track.start) / track.duration
    pose[track.channel] = progress >= 1 ? track.to : track.from + (track.to - track.from) * track.ease(progress)
  }
  return pose
}
