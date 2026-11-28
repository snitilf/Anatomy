import type { Viewport } from '@xyflow/react'
import type { Selection } from '../app/state'
import { createContext, useContext } from 'react'
import type { Rect } from '../layout/geometry'
import type { Scene } from '../whiteboard/geometry'
import type { Frame, Limits, Size } from './camera'

/** Moves the map's camera, always inside the zoom and pan limits of what is on the map. */
export interface Camera {
  limits(): Limits
  /** The size of the map, and how much of its top and bottom overlays cover. */
  size(): Size & { top: number; bottom?: number }
  /** Returns where the camera goes, after the limits. */
  move(viewport: Viewport, duration?: number): Viewport
  /** Frames the whole content, or a box of it. */
  frame(options?: Frame, duration?: number): Viewport
  /**
   * Frames a box at once when any of it is off the free part of the map, and leaves a box that shows whole alone.
   * `upper` frames it in the upper half, above a phone's sheet. Returns whether the camera moved.
   */
  show(box: Rect, options?: { padding?: number; maxZoom?: number; upper?: boolean }): boolean
  /**
   * Keeps a fitted view fitted: while the view is still the last whole-board frame and nothing else has moved the camera
   * since, frames the whole board again when the map has a new size, or always while the board is still `opening`.
   * Returns `framed` when it framed the board again, `kept` when the view was fitted already, and nothing when the view
   * is not fitted.
   */
  refit(opening?: boolean): 'framed' | 'kept' | undefined
  /** Frames the whole board once the map has drawn its next layout, such as after Tidy layout. */
  fitAfterLayout(): void
  /** Steps the zoom in or out, resets it to 100%, or fits the whole board. It glides when `animate` and motion is allowed. */
  zoom(command: ZoomCommand, animate?: boolean): void
  /** Where a card is on the map now. */
  rectOf(id: string): Rect | undefined
  /**
   * The box around something selected on the map: a part, both ends of a connection as drawn (a moved end where the user
   * moved it) or of a link or bundle, a new part, or a drawing. Nothing for the board.
   */
  boxOf(selection: Selection): Rect | undefined
  /** Every card and every drawn line, as the map shows them now. */
  scene(): Scene
}

export type ZoomCommand = 'in' | 'out' | 'reset' | 'fit'

/** The camera of the map that is open, for code outside the map such as commands. Empty while no map is shown. */
export interface CameraSlot {
  get(): Camera | undefined
  set(camera: Camera | undefined): void
}

export function createCameraSlot(): CameraSlot {
  let current: Camera | undefined
  return { get: () => current, set: (camera) => (current = camera) }
}

export const CameraSlotContext = createContext<CameraSlot>(createCameraSlot())

export const CameraContext = createContext<Camera | undefined>(undefined)

export function useCamera(): Camera {
  const camera = useContext(CameraContext)
  if (!camera) throw new Error('useCamera needs a CameraContext')
  return camera
}

/** Glides that the user starts with a pointer. Keys and reduced motion move at once. */
export const GLIDE_MS = 160

export function prefersStillness(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
