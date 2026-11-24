/** Stub for the test commit: the signatures the tests use. The timeline comes in the next commit. */
import { type LessonEvent, type LessonState } from './model'

export type Ease = (t: number) => number
export type Slot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
export type Channel =
  | 'card' | 'push' | 'cardAlpha' | 'stampAlpha' | 'cardVersion' | 'tabSlot' | 'outboxAlpha' | 'outboxDrop' | 'outboxVersion'
  | 'shutter' | 'power' | 'dim' | 'bumpLock' | 'bumpFinger' | 'bumpPin'
  | `finger${Slot}` | `pin${Slot}` | `keyLift${Slot}` | `keyAlpha${Slot}`
export type Pose = Record<Channel, number>
export interface Track { channel: Channel; from: number; to: number; start: number; duration: number; ease: Ease }
export interface Beat { at: number; kind: 'commit' | 'deliver' | 'outboxOut' }
export interface Run { from: Pose; end: Pose; tracks: Track[]; beats: Beat[]; state: LessonState; duration: number }
export type CardRest = 'home' | 'lockout' | 'gate' | 'ledger'

const todo = (): never => {
  throw new Error('not built yet')
}
export const cubicBezier = (_x1: number, _y1: number, _x2: number, _y2: number): Ease => todo
export const OUT: Ease = todo
export const IN_OUT: Ease = todo
export const PIN_CLEAR = 0
export const fingerOf = (v: number) => `finger${v as Slot}` as const
export const pinOf = (v: number) => `pin${v as Slot}` as const
export const keyAlphaOf = (v: number) => `keyAlpha${v as Slot}` as const
export const isOpacity = (_channel: Channel): boolean => todo()
export const isStepped = (_channel: Channel): boolean => todo()
export const restFor = (_event: LessonEvent, _state: LessonState): CardRest => todo()
export const restPose = (_state: LessonState, _rest: CardRest): Pose => todo()
export const planRun = (_event: LessonEvent, _before: LessonState, _next: LessonState, _from: Pose, _reduced: boolean): Run => todo()
export const poseAt = (_run: Run, _time: number): Pose => todo()
