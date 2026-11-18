import { Command as Cmdk } from 'cmdk'
import { Check } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAppStore } from '../app/store'
import { useUi, useUiApi } from '../app/ui'
import { formatKeys } from './keys'
import { boardCommands, COMMANDS, isEnabled, isListed } from './list'
import { useCommands } from './context'
import styles from './CommandMenu.module.css'
import { SELECTION_COMMANDS, selectionName } from './selectionSection'
import { GROUP_ORDER, type Command, type CommandContext } from './types'

function Row({ command, ctx, onRun, inContext = false }: { command: Command; ctx: CommandContext; onRun: (c: Command) => void; inContext?: boolean }) {
  const Icon = command.icon
  const keys = command.keys?.[0]
  const checked = command.checked?.(ctx) ?? false
  return (
    <Cmdk.Item
      className={styles.item}
      value={command.id}
      keywords={[command.label, command.contextLabel ?? '', ...(command.keywords ?? [])]}
      disabled={!isEnabled(command, ctx)}
      onSelect={() => onRun(command)}
    >
      <Icon className={styles.icon} size={16} strokeWidth={1.5} aria-hidden="true" />
      <span className={styles.label}>{inContext ? (command.contextLabel ?? command.label) : command.label}</span>
      {checked && (
        <>
          <Check className={styles.check} size={16} strokeWidth={1.5} aria-hidden="true" />
          <span className="sr-only">, in use</span>
        </>
      )}
      {keys && <kbd className={styles.keys}>{formatKeys(keys)}</kbd>}
    </Cmdk.Item>
  )
}

/** Matches on the label and keywords only, never on the internal ID that cmdk keeps as the value. */
function filter(_value: string, search: string, keywords?: string[]): number {
  const words = search.toLowerCase().trim().split(/\s+/)
  const text = (keywords ?? []).join(' ').toLowerCase()
  if (words.every((w) => text.includes(w))) return text.startsWith(words[0] ?? '') ? 1 : 0.6
  return 0
}

function MenuBody({ onClose }: { onClose: () => void }) {
  const { context, run } = useCommands()
  const [search, setSearch] = useState('')
  // The menu reads the state as it opens, and again when it changes under it, such as a command that was run a frame ago.
  const state = useAppStore((s) => s)
  const ctx = useMemo(() => ({ ...context(), state }), [context, state])
  const all = useMemo(() => [...COMMANDS.filter((c) => !c.unlisted), ...boardCommands(ctx)], [ctx])
  const typing = search.trim() !== ''
  const name = selectionName(ctx)
  // What can be done with the selection comes first, once. The rest of the menu leaves those commands out.
  const here = name === undefined ? [] : SELECTION_COMMANDS.flatMap((id) => all.filter((c) => c.id === id && isEnabled(c, ctx) && isListed(c, ctx)))
  const shown = all.filter((c) => isListed(c, ctx) && (typing || !c.searchOnly) && !(name !== undefined && (SELECTION_COMMANDS as readonly string[]).includes(c.id)))
  const go = (command: Command) => {
    onClose()
    // After the dialog has given focus back, so a command that moves focus keeps it.
    requestAnimationFrame(() => run(command))
  }
  return (
    <>
      <Cmdk.Input className={styles.input} name="command-search" value={search} onValueChange={setSearch} placeholder="Type a command or search parts" />
      <Cmdk.List className={styles.list}>
        <Cmdk.Empty className={styles.empty}>Nothing matches "{search.trim()}".</Cmdk.Empty>
        {name !== undefined && here.length > 0 && (
          <Cmdk.Group heading={name} className={styles.group} data-selection="">
            {here.map((c) => (
              <Row key={c.id} command={c} ctx={ctx} onRun={go} inContext />
            ))}
          </Cmdk.Group>
        )}
        {GROUP_ORDER.map((group) => {
          const rows = shown.filter((c) => c.group === group)
          if (rows.length === 0) return null
          return (
            <Cmdk.Group key={group} heading={group} className={styles.group}>
              {rows.map((c) => (
                <Row key={c.id} command={c} ctx={ctx} onRun={go} />
              ))}
            </Cmdk.Group>
          )
        })}
      </Cmdk.List>
    </>
  )
}

/** Every command, and every part and connection by name. It opens with no motion: it is used many times a day. */
export function CommandMenu() {
  const open = useUi((u) => u.menuOpen)
  const ui = useUiApi()
  return (
    <Cmdk.Dialog
      open={open}
      onOpenChange={ui.setMenuOpen}
      label="Command menu"
      filter={filter}
      loop
      overlayClassName={styles.overlay ?? ''}
      contentClassName={styles.dialog ?? ''}
      className={styles.root}
    >
      {open && <MenuBody onClose={() => ui.setMenuOpen(false)} />}
    </Cmdk.Dialog>
  )
}
