import type { Viewport } from '@xyflow/react'
import { createContext, useContext } from 'react'
import type { Frame, Limits, Size } from './camera'

/** Moves the map's camera, always inside the zoom and pan limits of what is on the map. */
export interface Camera {
  limits(): Limits
  /** The size of the map, and how much of its top the notices cover. */
  size(): Size & { top: number }
  /** Returns where the camera goes, after the limits. */
  move(viewport: Viewport, duration?: number): Viewport
  /** Frames the whole content, or a box of it. */
  frame(options?: Frame, duration?: number): Viewport
}

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
