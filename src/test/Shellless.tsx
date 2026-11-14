import { useState, type ReactNode } from 'react'
import { TipProvider } from '../app/Tip'
import { createUi, UiContext } from '../app/ui'
import { CameraSlotContext, createCameraSlot } from '../canvas/cameraContext'
import { CommandsProvider } from '../commands/CommandsProvider'
import type { ShellActions } from '../commands/types'

const nothing = () => {}
const SHELL: ShellActions = { openFile: nothing, toOverview: nothing, closeWalkthrough: nothing, playWalkthrough: nothing, copyPrompt: nothing }

/** What the shell gives every part of the app: the UI store, the camera slot, the commands, and tooltips. For tests of one part. */
export function Shellless({ children, shell }: { children: ReactNode; shell?: Partial<ShellActions> }) {
  const [ui] = useState(createUi)
  const [camera] = useState(createCameraSlot)
  return (
    <UiContext.Provider value={ui}>
      <CameraSlotContext.Provider value={camera}>
        <TipProvider>
          <CommandsProvider shell={{ ...SHELL, ...shell }}>{children}</CommandsProvider>
        </TipProvider>
      </CameraSlotContext.Provider>
    </UiContext.Provider>
  )
}
