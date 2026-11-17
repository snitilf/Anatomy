import { Menu } from '@base-ui/react/menu'
import clsx from 'clsx'
import { Check, Settings2 } from 'lucide-react'
import { useCommand } from '../commands/context'
import { setThemeMode, useThemeMode, type ThemeMode } from '../theme/theme'
import buttons from './buttons.module.css'
import menu from './menu.module.css'
import { Tip } from './Tip'

const MODES: readonly ThemeMode[] = ['system', 'light', 'dark']

function ThemeItem({ mode }: { mode: ThemeMode }) {
  const command = useCommand(`theme.${mode}`)
  const Icon = command.command.icon
  return (
    <Menu.RadioItem value={mode} className={menu.item} closeOnClick>
      <Icon className={menu.icon} size={16} strokeWidth={1.5} aria-hidden="true" />
      <span className={menu.itemText}>{command.label.replace('Theme: ', '')}</span>
      <Menu.RadioItemIndicator className={menu.check}>
        <Check size={16} strokeWidth={1.5} aria-hidden="true" />
      </Menu.RadioItemIndicator>
    </Menu.RadioItem>
  )
}

/** The theme, and the guide for making a board. */
export function SettingsMenu({ className }: { className?: string }) {
  const mode = useThemeMode()
  const howTo = useCommand('howto')
  const HowToIcon = howTo.command.icon
  return (
    <Menu.Root>
      <Tip label="Settings">
        <Menu.Trigger className={clsx(buttons.button, buttons.quiet, buttons.icon, className)} aria-label="Settings">
          <Settings2 size={16} strokeWidth={1.5} aria-hidden="true" />
        </Menu.Trigger>
      </Tip>
      <Menu.Portal>
        <Menu.Positioner className={menu.positioner} side="bottom" align="end" sideOffset={6} collisionPadding={8}>
          <Menu.Popup className={menu.popup} data-dismissible>
            <Menu.Group>
              <Menu.GroupLabel className={menu.label}>Theme</Menu.GroupLabel>
              <Menu.RadioGroup value={mode} onValueChange={(value) => setThemeMode(value as ThemeMode)}>
                {MODES.map((m) => (
                  <ThemeItem key={m} mode={m} />
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
            <Menu.Separator className={menu.separator} />
            <Menu.Item className={menu.item} onClick={howTo.run}>
              <HowToIcon className={menu.icon} size={16} strokeWidth={1.5} aria-hidden="true" />
              <span className={menu.itemText}>{howTo.label}</span>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
