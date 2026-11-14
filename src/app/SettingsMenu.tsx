import { Menu } from '@base-ui/react/menu'
import clsx from 'clsx'
import { Check, Monitor, Moon, Settings2, Sun, type LucideIcon } from 'lucide-react'
import { setThemeMode, useThemeMode, type ThemeMode } from '../theme/theme'
import buttons from './buttons.module.css'
import menu from './menu.module.css'

const MODES: readonly { mode: ThemeMode; label: string; icon: LucideIcon }[] = [
  { mode: 'system', label: 'System', icon: Monitor },
  { mode: 'light', label: 'Light', icon: Sun },
  { mode: 'dark', label: 'Dark', icon: Moon },
]

/** App settings. For now it holds the theme. */
export function SettingsMenu() {
  const mode = useThemeMode()
  return (
    <Menu.Root>
      <Menu.Trigger className={clsx(buttons.button, buttons.quiet, buttons.icon)} aria-label="Settings" title="Settings">
        <Settings2 size={16} strokeWidth={1.5} aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className={menu.positioner} side="bottom" align="end" sideOffset={6} collisionPadding={8}>
          <Menu.Popup className={menu.popup} data-dismissible>
            <Menu.Group>
              <Menu.GroupLabel className={menu.label}>Theme</Menu.GroupLabel>
              <Menu.RadioGroup value={mode} onValueChange={(value) => setThemeMode(value as ThemeMode)}>
                {MODES.map(({ mode: value, label, icon: Icon }) => (
                  <Menu.RadioItem key={value} value={value} className={menu.item} closeOnClick>
                    <Icon className={menu.icon} size={16} strokeWidth={1.5} aria-hidden="true" />
                    <span className={menu.itemText}>{label}</span>
                    <Menu.RadioItemIndicator className={menu.check}>
                      <Check size={16} strokeWidth={1.5} aria-hidden="true" />
                    </Menu.RadioItemIndicator>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
