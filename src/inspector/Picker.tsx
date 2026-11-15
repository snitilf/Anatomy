import { Popover } from '@base-ui/react/popover'
import clsx from 'clsx'
import { Command as Cmdk } from 'cmdk'
import { useState, type ReactNode } from 'react'
import buttons from '../app/buttons.module.css'
import styles from './Picker.module.css'
import type { PickerItem } from './pickerItems'


/**
 * A button that opens a searchable list in a popover. Picking a row calls `onPick` and closes it.
 * `open` and `onOpenChange` let a command open it from the keyboard.
 */
export function Picker({
  label,
  trigger,
  items,
  onPick,
  placeholder = 'Search parts',
  open: controlled,
  onOpenChange,
  className,
  title,
}: {
  label: string
  trigger: ReactNode
  items: readonly PickerItem[]
  onPick: (value: string) => void
  placeholder?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
  /** The full text of a trigger that may be cut short. */
  title?: string
}) {
  const [own, setOwn] = useState(false)
  const open = controlled ?? own
  const setOpen = (next: boolean) => {
    setOwn(next)
    onOpenChange?.(next)
  }
  const groups = [...new Set(items.map((i) => i.group ?? ''))]
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className={className ?? clsx(buttons.button, buttons.small)} aria-label={label} title={title}>
        {trigger}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className={styles.positioner} side="bottom" align="start" sideOffset={4} collisionPadding={8}>
          <Popover.Popup className={styles.popup} aria-label={label} data-dismissible>
            <Cmdk label={label} loop className={styles.root}>
              <Cmdk.Input className={styles.input} placeholder={placeholder} autoFocus />
              <Cmdk.List className={styles.list}>
                <Cmdk.Empty className={styles.empty}>No match.</Cmdk.Empty>
                {groups.map((group) => (
                  <Cmdk.Group key={group} heading={group || undefined} className={styles.group}>
                    {items
                      .filter((i) => (i.group ?? '') === group)
                      .map((item) => (
                        <Cmdk.Item
                          key={item.value}
                          value={item.value}
                          keywords={[item.label]}
                          className={styles.item}
                          onSelect={() => {
                            setOpen(false)
                            onPick(item.value)
                          }}
                        >
                          {item.label}
                        </Cmdk.Item>
                      ))}
                  </Cmdk.Group>
                ))}
              </Cmdk.List>
            </Cmdk>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

