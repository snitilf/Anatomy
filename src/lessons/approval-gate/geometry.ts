/**
 * Static geometry for the dispatch press.
 * World units are about one pixel of the real thing. x runs along the card's path, y across it, z up.
 * Everything here is computed once at module load. Only positions change at run time.
 */
import {
  corners,
  cylinder,
  extrude,
  fitProjection,
  insetPlan,
  iso,
  lineOnTop,
  pathOf,
  planOutline,
  pointsAt,
  ring,
  rise,
  segment,
  slabOf,
  topMatrix,
  topTicks,
  type Flat,
  type Plan,
  type Plane,
  type Point3,
  type Projection,
} from '../kit/iso-kit'

export const WIDTH = 760
export const HEIGHT = 440
export const AZIMUTH = 122
export const ELEVATION = 40

export const SLOTS = 8
export const PITCH = 6
/** The y position of the slot that holds version `version` (1 to 8). */
export const slotY = (version: number) => (version - 1 - (SLOTS - 1) / 2) * PITCH

// Levels
export const DECK_TOP = 3
export const CARD_H = 2.5
export const CARD_TOP = DECK_TOP + CARD_H
export const BLOCK_Z = 7
export const TAB_TOP = 13
export const LIFT = 14
export const SHUTTER_LIFT = 11

// The base, the deck and the carrier
export const BASE: Plan = { x: -150, y: -58, w: 305, d: 116, r: 8 }
export const BASE_H = 8
export const FOOT_H = 8
export const DECK: Plan = { x: -136, y: -34, w: 262, d: 68, r: 3 }

// The card and the pusher, at home
export const CARD: Plan = { x: -92, y: -26, w: 38, d: 52, r: 2 }
export const CARD_FRONT = CARD.x + CARD.w
export const TAB_LEN = 9
export const TAB_WIDTH = 4.2
export const TAB_TIP = CARD_FRONT + TAB_LEN
const PUSHER: Plan = { x: -106, y: -23, w: 14, d: 46, r: 1.5 }
const TONGUE: Plan = { x: -124, y: -9, w: 18, d: 18, r: 3 }

// The three arches
export const LOCK_X = -29
export const GATE_X = 7
export const LEDGER_X = 55
const POST_W = 10
const POST_Y = 36
const POST_D = 6
const POST_TOP = 47
const BAR_Z = 40
const BAR_H = 5
const COMB_Z = 33
const COMB_H = 7
const SPINE = 2
const TEETH = 2.6
const STRIP_W = 1.6
export const FINGER_W = 2.2
export const FINGER_D = 3.6
export const FINGER_LEN = 30
export const PIN_R = 1.2
export const PIN_LEN = 30
const SHUTTER: Plan = { x: LOCK_X - 2, y: -POST_Y, w: 4, d: POST_Y * 2, r: 0.6 }
export const SHUTTER_Z = BLOCK_Z
export const SHUTTER_H = 22
/** The face of the hazard tag, which sits proud of the shutter on the side the card comes from. */
export const TAG_X = SHUTTER.x - 1.2

/** Where the card's tab stops against each blocker, as a distance from home. */
export const FINGER_FACE = GATE_X - POST_W / 2 - SPINE - TEETH + 0.2
export const PIN_FACE = LEDGER_X - POST_W / 2 - SPINE - TEETH + 0.2
export const END_FRONT = 108
export const TRAVEL_END = END_FRONT - CARD_FRONT
export const REACH_LOCK = TAG_X - TAB_TIP
export const REACH_GATE = FINGER_FACE - TAB_TIP
export const REACH_LEDGER = PIN_FACE - TAB_TIP

/**
 * The faces the tab tip meets, in the order the card meets them: the lockout tag, the gate fingers, the ledger pins.
 * The tab is drawn behind a blocker once its tip is beyond that blocker's face. The card body never needs this:
 * it and the pusher stay under every overhead part, so they are drawn once, under every arch.
 */
export const BLOCKER_FACES = [TAG_X, FINGER_FACE, PIN_FACE] as const

const RADIANS = Math.PI / 180

function fit(): Projection {
  const points: Point3[] = []
  const add = (plan: Plan, z0: number, z1: number) => {
    for (const x of [plan.x, plan.x + plan.w]) for (const y of [plan.y, plan.y + plan.d]) for (const z of [z0, z1]) points.push([x, y, z])
  }
  add(BASE, -BASE_H - FOOT_H, 0)
  add({ x: LOCK_X - 7, y: -POST_Y - POST_D, w: POST_W, d: POST_Y * 2 + POST_D * 2, r: 0 }, 0, POST_TOP)
  add({ x: LEDGER_X - 7, y: -POST_Y - POST_D, w: POST_W, d: POST_Y * 2 + POST_D * 2, r: 0 }, 0, 60)
  add({ x: GATE_X - 7, y: -POST_Y - POST_D, w: POST_W, d: POST_Y * 2 + POST_D * 2, r: 0 }, 0, 60)
  return fitProjection(points, WIDTH, HEIGHT, { pad: 22, azimuth: AZIMUTH, elevation: ELEVATION })
}

export const P: Projection = fit()
export const at = (point: Point3): Flat => iso(point, P)

const origin = at([0, 0, 0])
const minus = (a: Flat, b: Flat): Flat => [a[0] - b[0], a[1] - b[1]]
/** Screen vector of one world unit along each axis. */
export const EX = minus(at([1, 0, 0]), origin)
export const EY = minus(at([0, 1, 0]), origin)
export const EZ = minus(at([0, 0, 1]), origin)
const fine = (value: number) => Math.round(value * 100) / 100
/** A transform that moves a prebuilt group by a world offset. */
export const shift = (x: number, y = 0, z = 0) => `translate(${fine(EX[0] * x + EY[0] * y + EZ[0] * z)} ${fine(EX[1] * x + EY[1] * y + EZ[1] * z)})`

const slab = (plan: Plan, z: number, h: number, steps = 4, bevel = 0) => slabOf(plan, z, h, P, steps, bevel)
const disc = (cx: number, cy: number, r: number, z: number, h: number, steps = 28, bevel = 0) => cylinder(cx, cy, r, z, h, P, steps, bevel)
const dots = (points: Point3[]) => pointsAt(points, P)
const onFaceX = (x: number, y: number, z: number, r: number, steps = 20): string =>
  pathOf(
    Array.from({ length: steps }, (_, i) => {
      const t = (i / steps) * Math.PI * 2
      return iso([x, y + r * Math.cos(t), z + r * Math.sin(t)], P)
    }),
    true,
  )
const sorted = <T,>(items: readonly T[], key: (item: T) => number) => [...items].sort((a, b) => key(a) - key(b))
/** Far before near for things on the floor. */
const byDepth = (points: Plane[]) => sorted(points, ([x, y]) => iso([x, y, 0], P)[1])
const versions = Array.from({ length: SLOTS }, (_, i) => i + 1)

// Base, feet, ruler, label plate and the power switch

const baseHalo = slab(BASE, -BASE_H, BASE_H, 8).fill
const feet = byDepth(corners(BASE, 8)).map(([x, y]) => [disc(x, y, 6.6, -BASE_H - FOOT_H, 1.6, 28), disc(x, y, 5.2, -BASE_H - FOOT_H + 1.6, FOOT_H - 1.6, 28)] as const)
const baseSlab = slab(BASE, -BASE_H, BASE_H, 8, 1.4)
const baseGroove = planOutline(insetPlan(BASE, 5), 0, P, 8)
const baseScrewAt = corners(BASE, 10)
const baseScrewRings = baseScrewAt.map(([x, y]) => ring(x, y, 2.2, 0, P, 16)).join('')
const baseScrews = dots(baseScrewAt.map(([x, y]) => [x, y, 0] as Point3))

const RULER: Plan = { x: -86, y: 49, w: 128, d: 5, r: 1 }
const rulerStrip = slab(RULER, 0, 0.8, 3)
const rulerTicks = topTicks(RULER.x + 4, RULER.x + RULER.w - 4, 4, 5, RULER.y + 0.4, 0.8, [2, 3.6], P)

const LABEL: Plan = { x: 62, y: 47.5, w: 62, d: 8.5, r: 2 }
const labelPlate = slab(LABEL, 0, 0.9, 4)
const labelInset = planOutline(insetPlan(LABEL, 1.6), 0.9, P, 4)
const labelRules = [lineOnTop([LABEL.x + 37, LABEL.y + 3.4], [LABEL.x + 56, LABEL.y + 3.4], 0.9, P), lineOnTop([LABEL.x + 37, LABEL.y + 5.2], [LABEL.x + 50, LABEL.y + 5.2], 0.9, P)].join('')
const labelScrews = dots([
  [LABEL.x + 3.4, LABEL.y + LABEL.d / 2, 0.9],
  [LABEL.x + LABEL.w - 3.4, LABEL.y + LABEL.d / 2, 0.9],
])
const labelMatrix = topMatrix([LABEL.x + 7, LABEL.y + 5.6], 0.9, P, 'x')

const VENT: Plan = { x: 62, y: -55, w: 62, d: 9, r: 2 }
const ventPlate = slab(VENT, 0, 0.9, 4)
const ventSlots = (() => {
  const lines: string[] = []
  for (let i = 0; i < 9; i++) lines.push(planOutline({ x: VENT.x + 5 + i * 6, y: VENT.y + 2, w: 2.4, d: 5, r: 1.2 }, 0.9, P, 3))
  return lines.join('')
})()
const FAR_RULER: Plan = { x: -86, y: -54, w: 128, d: 5, r: 1 }
const farRuler = slab(FAR_RULER, 0, 0.8, 3)
const farRulerTicks = topTicks(FAR_RULER.x + 4, FAR_RULER.x + FAR_RULER.w - 4, 4, 5, FAR_RULER.y + 0.4, 0.8, [2, 3.6], P)

export const BASE_ART = { ventPlate, ventSlots, farRuler, farRulerTicks, halo: baseHalo, feet, slab: baseSlab, groove: baseGroove, screwRings: baseScrewRings, screws: baseScrews, rulerStrip, rulerTicks, labelPlate, labelInset, labelRules, labelScrews, labelMatrix }

export const SWITCH_HOUSING: Plan = { x: -134, y: 38, w: 30, d: 16, r: 2 }
const switchHousing = slab(SWITCH_HOUSING, 0, 8, 4, 0.6)
const switchSeam = planOutline(insetPlan(SWITCH_HOUSING, 2), 8, P, 4)
const switchScrews = dots([
  [SWITCH_HOUSING.x + 3.4, SWITCH_HOUSING.y + 3.4, 8],
  [SWITCH_HOUSING.x + SWITCH_HOUSING.w - 3.4, SWITCH_HOUSING.y + 3.4, 8],
  [SWITCH_HOUSING.x + 3.4, SWITCH_HOUSING.y + SWITCH_HOUSING.d - 3.4, 8],
  [SWITCH_HOUSING.x + SWITCH_HOUSING.w - 3.4, SWITCH_HOUSING.y + SWITCH_HOUSING.d - 3.4, 8],
])
const SLIDER_TRACK: Plan = { x: -126, y: 43, w: 14, d: 6, r: 2.4 }
const switchTrack = slab(SLIDER_TRACK, 8, 0.6, 5)
/** The rocker is built at the "on" end and moves 5 units toward -x when the power is off. */
const switchKnob = slab({ x: -120, y: 43.6, w: 6.8, d: 4.8, r: 1.8 }, 8.6, 2.6, 5, 0.5)
const switchKnobRidges = [1.6, 3.4, 5.2].map((dx) => lineOnTop([-120 + dx, 44.2], [-120 + dx, 47.6], 11.2, P)).join('')
const LAMP = { x: -108, y: 46 }
const lampBody = disc(LAMP.x, LAMP.y, 2.8, 8, 2.6, 24, 0.4)
const lampLens = disc(LAMP.x, LAMP.y, 1.8, 10.6, 0.6, 20)
const lampRing = ring(LAMP.x, LAMP.y, 3.6, 8, P, 24)
export const SWITCH_TRAVEL = 5

export const SWITCH_ART = { housing: switchHousing, seam: switchSeam, screws: switchScrews, track: switchTrack, knob: switchKnob, ridges: switchKnobRidges, lampBody, lampLens, lampRing }

// Deck, lips, stop and end wall

const deckSlab = slab(DECK, 0, DECK_TOP, 6, 0.8)
const deckGroove = planOutline(insetPlan(DECK, 3.5), DECK_TOP, P, 6)
const LIP_FAR: Plan = { x: DECK.x, y: DECK.y, w: DECK.w, d: 4, r: 1 }
const LIP_NEAR: Plan = { x: DECK.x, y: DECK.y + DECK.d - 4, w: DECK.w, d: 4, r: 1 }
const lipFar = slab(LIP_FAR, DECK_TOP, 3.2, 3, 0.4)
const lipNear = slab(LIP_NEAR, DECK_TOP, 3.2, 3, 0.4)
const lipRivets = (plan: Plan) => {
  const points: Point3[] = []
  for (let x = DECK.x + 10; x < DECK.x + DECK.w - 6; x += 16) points.push([x, plan.y + plan.d / 2, DECK_TOP + 3.2])
  return dots(points)
}
const STOP: Plan = { x: DECK.x, y: DECK.y, w: 5, d: DECK.d, r: 1 }
const stopSlab = slab(STOP, DECK_TOP, 9, 3, 0.5)
const stopScrews = dots([-26, -9, 9, 26].map((y) => [STOP.x + 2.5, y, DECK_TOP + 9] as Point3))
const WALL: Plan = { x: DECK.x + DECK.w - 6, y: DECK.y, w: 6, d: DECK.d, r: 1 }
const wallSlab = slab(WALL, DECK_TOP, 14, 3, 0.5)
const wallScrews = dots([-26, -9, 9, 26].map((y) => [WALL.x + 3, y, DECK_TOP + 14] as Point3))
const wallSeam = (() => {
  // A trim line across the end wall's visible face, edge to edge.
  const x = WALL.x
  return segment([x, WALL.y, DECK_TOP + 9], [x, WALL.y + WALL.d, DECK_TOP + 9], P)
})()
const deckTicks = (() => {
  const lines: string[] = []
  for (let x = -70; x <= 100; x += 10) lines.push(lineOnTop([x, DECK.y + 4], [x, DECK.y + 4 + (x % 50 === 0 ? 3 : 1.6)], DECK_TOP, P))
  return lines.join('')
})()

export const DECK_ART = { slab: deckSlab, groove: deckGroove, lipFar, lipNear, farRivets: lipRivets(LIP_FAR), nearRivets: lipRivets(LIP_NEAR), stop: stopSlab, stopScrews, wall: wallSlab, wallScrews, wallSeam, ticks: deckTicks }

// The pusher: a flat paddle that rides behind the card. Everything on it stays under 5.5.

const pusherPlate = slab(PUSHER, DECK_TOP, CARD_H, 3, 0.4)
const pusherTongue = slab(TONGUE, DECK_TOP, CARD_H, 5, 0.4)
const pusherHole = planOutline({ x: TONGUE.x + 4, y: -3, w: 9, d: 6, r: 3 }, CARD_TOP, P, 6)
const pusherRidges = [3, 5, 7].map((dy) => lineOnTop([PUSHER.x + 3, PUSHER.y + 6 + dy * 4 - 10], [PUSHER.x + PUSHER.w - 3, PUSHER.y + 6 + dy * 4 - 10], CARD_TOP, P)).join('')
const pusherScrews = dots([
  [PUSHER.x + 3, PUSHER.y + 3, CARD_TOP],
  [PUSHER.x + 3, PUSHER.y + PUSHER.d - 3, CARD_TOP],
  [PUSHER.x + PUSHER.w - 3, PUSHER.y + 3, CARD_TOP],
  [PUSHER.x + PUSHER.w - 3, PUSHER.y + PUSHER.d - 3, CARD_TOP],
])
const pusherJoin = planOutline({ ...PUSHER, x: PUSHER.x + 1.2, y: PUSHER.y + 1.2, w: PUSHER.w - 2.4, d: PUSHER.d - 2.4, r: 0.6 }, CARD_TOP, P, 3)

export const PUSHER_ART = { plate: pusherPlate, tongue: pusherTongue, hole: pusherHole, ridges: pusherRidges, screws: pusherScrews, join: pusherJoin }

// The card with its slot ruler and one tab per version

const cardSlab = slab(CARD, DECK_TOP, CARD_H, 4, 0.4)
const cardInset = planOutline(insetPlan(CARD, 2.2), CARD_TOP, P, 4)
const slotTicks = versions
  .map((v) => lineOnTop([CARD_FRONT, slotY(v)], [CARD_FRONT - 3, slotY(v)], CARD_TOP, P))
  .join('')
const cardRules = [
  lineOnTop([CARD.x + 5, CARD.y + 8], [CARD.x + 22, CARD.y + 8], CARD_TOP, P),
  lineOnTop([CARD.x + 5, CARD.y + 11.5], [CARD.x + 28, CARD.y + 11.5], CARD_TOP, P),
  lineOnTop([CARD.x + 5, CARD.y + CARD.d - 11.5], [CARD.x + 28, CARD.y + CARD.d - 11.5], CARD_TOP, P),
  lineOnTop([CARD.x + 5, CARD.y + CARD.d - 8], [CARD.x + 18, CARD.y + CARD.d - 8], CARD_TOP, P),
].join('')
const cardStampAt: Plane = [CARD.x + CARD.w / 2 - 3, 4]
const cardStampMatrix = topMatrix(cardStampAt, CARD_TOP, P, 'x')
const cardCorners = dots(corners(insetPlan(CARD, 1.2), 0).map(([x, y]) => [x, y, CARD_TOP] as Point3))

const tabs = versions.map((v) => {
  const y = slotY(v)
  const plan: Plan = { x: CARD_FRONT, y: y - TAB_WIDTH / 2, w: TAB_LEN, d: TAB_WIDTH, r: 0.8 }
  return {
    body: slab(plan, DECK_TOP, TAB_TOP - DECK_TOP, 3, 0.4),
    hole: onFaceX(CARD_FRONT + TAB_LEN, y, 8.2, 1.3),
    edge: segment([CARD_FRONT, y - TAB_WIDTH / 2, 10.4], [CARD_FRONT + TAB_LEN, y - TAB_WIDTH / 2, 10.4], P),
  }
})

export const CARD_ART = { slab: cardSlab, inset: cardInset, slotTicks, rules: cardRules, stampMatrix: cardStampMatrix, corners: cardCorners, tabs }

// An arch: two posts on foot plates and a thin crossbar

function postPlan(cx: number, side: -1 | 1): Plan {
  return { x: cx - POST_W / 2, y: side < 0 ? -POST_Y - POST_D : POST_Y, w: POST_W, d: POST_D, r: 1 }
}

function arch(cx: number) {
  const post = (side: -1 | 1) => {
    const plan = postPlan(cx, side)
    const footPlan: Plan = { x: plan.x - 3, y: plan.y - (side < 0 ? 3 : 1), w: plan.w + 6, d: plan.d + 4, r: 1.2 }
    const faceX = plan.x
    const foot = slab(footPlan, 0, 1.6, 3, 0.3)
    const footScrews = dots(corners(footPlan, 2).map(([x, y]) => [x, y, 1.6] as Point3))
    const body = slab(plan, 1.6, POST_TOP - 1.6, 3, 0.4)
    // Seams and bolts on the face that points at the viewer (-x).
    const band = (z: number) => segment([faceX, plan.y, z], [faceX, plan.y + plan.d, z], P)
    const bands = [10, 22].map(band).join('')
    const bolts = dots([8, 30, 42].flatMap((z) => [[faceX, plan.y + plan.d / 2, z] as Point3]))
    const cap = slab({ x: plan.x - 0.8, y: plan.y - 0.8, w: plan.w + 1.6, d: plan.d + 1.6, r: 1 }, POST_TOP, 1.6, 3, 0.3)
    return { foot, footScrews, body, bands, bolts, cap }
  }
  const barPlan: Plan = { x: cx - POST_W / 2, y: -POST_Y, w: POST_W, d: POST_Y * 2, r: 0.6 }
  const bar = slab(barPlan, BAR_Z, BAR_H, 3, 0.4)
  const barSeam = lineOnTop([cx - POST_W / 2 + 1.8, -POST_Y + 0.001], [cx - POST_W / 2 + 1.8, POST_Y - 0.001], BAR_Z + BAR_H, P)
  const barSeamB = lineOnTop([cx + POST_W / 2 - 1.8, -POST_Y + 0.001], [cx + POST_W / 2 - 1.8, POST_Y - 0.001], BAR_Z + BAR_H, P)
  return { far: post(-1), near: post(1), bar, barSeam, barSeamB }
}

export const LOCK_ARCH = arch(LOCK_X)
export const GATE_ARCH = arch(GATE_X)
export const LEDGER_ARCH = arch(LEDGER_X)

// A comb guide for the fingers or pins: a spine on the crossbar and nine teeth between eight slots.

function comb(cx: number) {
  const xBack = cx - POST_W / 2 - SPINE
  const xMid = cx - POST_W / 2
  const xFront = xBack - TEETH
  const tw = 1.6
  const centres = Array.from({ length: SLOTS + 1 }, (_, i) => (i - SLOTS / 2) * PITCH)
  const top = centres[centres.length - 1] ?? 0
  const bottom = centres[0] ?? 0
  const outline: Plane[] = []
  outline.push([xMid, bottom - tw / 2], [xMid, top + tw / 2])
  for (let i = centres.length - 1; i >= 0; i--) {
    const c = centres[i] ?? 0
    outline.push([xBack, c + tw / 2], [xFront, c + tw / 2], [xFront, c - tw / 2], [xBack, c - tw / 2])
  }
  const body = extrude(outline, COMB_Z, COMB_H, P, { convex: false })
  const stripPlan: Plan = { x: xFront - STRIP_W, y: bottom - tw / 2, w: STRIP_W, d: top - bottom + tw, r: 0.4 }
  const strip = slab(stripPlan, COMB_Z, COMB_H - 1, 3, 0.3)
  const stripScrews = dots([bottom + 1.4, top - 1.4].map((y) => [stripPlan.x, y, COMB_Z + COMB_H - 1] as Point3))
  const stripSeam = segment([stripPlan.x, stripPlan.y, COMB_Z + 3.2], [stripPlan.x, stripPlan.y + stripPlan.d, COMB_Z + 3.2], P)
  return { body, strip, stripScrews, stripSeam, xFront, xBack }
}

export const GATE_COMB = comb(GATE_X)
export const LEDGER_COMB = comb(LEDGER_X)

const slotNumbers = (cx: number, z: number) =>
  versions.map((v) => ({ v, matrix: topMatrix([cx - 1.2, slotY(v) + 1.2], z, P, 'x') }))
export const GATE_NUMBERS = slotNumbers(GATE_X, BAR_Z + BAR_H)
export const LEDGER_NUMBERS = slotNumbers(LEDGER_X, BAR_Z + BAR_H)

// Gate fingers and their keys. A finger is built with its foot at BLOCK_Z and moves up by LIFT.

const fingerX = FINGER_FACE
const fingers = versions.map((v) => {
  const y = slotY(v)
  const plan: Plan = { x: fingerX, y: y - FINGER_D / 2, w: FINGER_W, d: FINGER_D, r: 0.5 }
  const top = BLOCK_Z + FINGER_LEN
  return {
    v,
    body: slab(plan, BLOCK_Z, FINGER_LEN, 3, 0.3),
    eye: onFaceX(fingerX, y, top - 5, 0.95),
    groove: segment([fingerX, y - FINGER_D / 2, BLOCK_Z + 4], [fingerX, y + FINGER_D / 2, BLOCK_Z + 4], P),
    notch: segment([fingerX, y - FINGER_D / 2, top - 11], [fingerX, y + FINGER_D / 2, top - 11], P),
  }
})

/** The approval key is a stem with a round bow. It rests on top of the finger it lifts. */
const keys = versions.map((v) => {
  const y = slotY(v)
  const base = BLOCK_Z + FINGER_LEN
  const bowZ = base + 6
  const cx = fingerX + FINGER_W / 2
  const stem = slab({ x: cx - 0.8, y: y - 0.9, w: 1.6, d: 1.8, r: 0.4 }, base, 6, 2)
  const bow = disc(cx, y, 4.6, bowZ, 1.8, 36, 0.4)
  const bowHole = ring(cx, y, 4.6 - 1.0, bowZ + 1.8, P, 36)
  const tooth = slab({ x: cx - 0.8, y: y + 0.9, w: 1.6, d: 1.6, r: 0.2 }, base + 0.8, 2.4, 2)
  return { v, stem, bow, bowHole, tooth, stamp: topMatrix([cx - 2.4, y + 1.3], bowZ + 1.8, P, 'x') }
})

export const FINGER_ART = { fingers, keys }

// Ledger pins and their caps

const pinX = PIN_FACE + PIN_R
const pins = versions.map((v) => {
  const y = slotY(v)
  const top = BLOCK_Z + PIN_LEN
  return {
    v,
    rod: disc(pinX, y, PIN_R, BLOCK_Z, PIN_LEN, 16),
    cap: disc(pinX, y, 2.0, top, 2.8, 20, 0.3),
    capRing: ring(pinX, y, 1.2, top + 2.8, P, 14),
    band: pathOf(
      Array.from({ length: 9 }, (_, i) => {
        const a = (RADIANS * (AZIMUTH - 90)) + (i / 8) * Math.PI
        return iso([pinX + PIN_R * Math.cos(a), y + PIN_R * Math.sin(a), BLOCK_Z + 5], P)
      }),
    ),
    tip: ring(pinX, y, PIN_R, BLOCK_Z, P, 16),
  }
})

export const PIN_ART = { pins }

// The lockout shutter, its tag plate and hazard stripes

const shutterBody = slab(SHUTTER, SHUTTER_Z, SHUTTER_H, 3, 0.4)
const TAG_Y0 = -15
const TAG_Y1 = 15
const TAG_Z0 = SHUTTER_Z + 5
const TAG_Z1 = SHUTTER_Z + SHUTTER_H - 5
const tag = slab({ x: TAG_X, y: TAG_Y0, w: 1.2, d: TAG_Y1 - TAG_Y0, r: 0.4 }, TAG_Z0, TAG_Z1 - TAG_Z0, 2, 0)
const stripes = (() => {
  const lines: string[] = []
  const rise0 = TAG_Z1 - TAG_Z0
  for (let y = TAG_Y0; y + rise0 <= TAG_Y1 + 1e-6; y += 5) lines.push(segment([TAG_X, y, TAG_Z0], [TAG_X, y + rise0, TAG_Z1], P))
  return lines.join('')
})()
const shutterScrews = dots([
  [SHUTTER.x, -33, SHUTTER_Z + 3],
  [SHUTTER.x, 33, SHUTTER_Z + 3],
  [SHUTTER.x, -33, SHUTTER_Z + SHUTTER_H - 3],
  [SHUTTER.x, 33, SHUTTER_Z + SHUTTER_H - 3],
])
const shutterSeam = segment([SHUTTER.x, -POST_Y, SHUTTER_Z + 3.2], [SHUTTER.x, POST_Y, SHUTTER_Z + 3.2], P)
const lockGrooves = [-POST_Y, POST_Y].map((y) => rise([SHUTTER.x - 0.6, y], 1.6, POST_TOP, P))

export const SHUTTER_ART = { body: shutterBody, tag, stripes, screws: shutterScrews, seam: shutterSeam, grooves: lockGrooves.join('') }

// Delivered cards in the outbox

const stackShift = END_FRONT - CARD_FRONT
export const STACK_SHIFT = stackShift
export const STACK_STEP = CARD_H

// Text positions

export const STAMP_SIZE = 11
export const KEY_SIZE = 3.6
export const NUMBER_SIZE = 3.2
export const LABEL_SIZE = 3.4
