import { useAppState } from '../app/appContext'
import type { Board } from '../board/schema'
import { SourceBadge } from '../app/SourceBadge'
import { usePanel } from './panelContext'
import { BulletList, Heading, ItemGroups, Section } from './parts'
import styles from './parts.module.css'

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

export function Overview({ board }: { board: Board }) {
  const { changes } = useAppState()
  const { choose } = usePanel()
  const names = new Map(board.components.map((c) => [c.id, c.label]))
  const groupName = new Map(board.groups.map((g) => [g.id, g.label]))
  const boardItems = board.items.filter((i) => i.about === undefined)

  const changed = changes
    ? [
        changes.added.components.length + changes.added.relationships.length,
        changes.changed.components.length + changes.changed.relationships.length,
        changes.removed.components.length + changes.removed.relationships.length,
      ]
    : undefined
  const hasChanges = changed !== undefined && (changed.some((n) => n > 0) || changes?.boardChanged)

  return (
    <>
      <Heading>{board.title}</Heading>
      <p className={styles.lead}>{board.goal}</p>

      {hasChanges && changed && (
        <p className={styles.changes}>
          Since the version you had open: {plural(changed[0] ?? 0, 'part or connection', 'parts or connections')} added,{' '}
          {changed[1] ?? 0} changed, {changed[2] ?? 0} removed.
        </p>
      )}

      {board.scope.includes.length > 0 && (
        <Section title="Covers">
          <BulletList items={board.scope.includes} />
        </Section>
      )}
      {board.scope.excludes.length > 0 && (
        <Section title="Does not cover">
          <BulletList items={board.scope.excludes} />
        </Section>
      )}

      <ItemGroups items={boardItems} />

      <Section title={`Parts (${board.components.length})`}>
        <ul className={styles.plain}>
          {board.components.map((c) => (
            <li key={c.id}>
              <button type="button" className={styles.row} onClick={() => choose({ type: 'component', id: c.id })}>
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{c.label}</span>
                  {c.group && groupName.get(c.group) && <span className={styles.rowMeta}>{groupName.get(c.group)}</span>}
                </span>
                <SourceBadge kind={c.source.kind} />
              </button>
            </li>
          ))}
        </ul>
      </Section>

      {board.relationships.length > 0 && (
        <Section title={`Connections (${board.relationships.length})`}>
          <ul className={styles.plain}>
            {board.relationships.map((r) => (
              <li key={r.id}>
                <button type="button" className={styles.row} onClick={() => choose({ type: 'relationship', id: r.id })}>
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>
                      {names.get(r.from) ?? r.from} <span aria-hidden="true">{'→'}</span>
                      <span className="sr-only"> to </span> {names.get(r.to) ?? r.to}
                    </span>
                    <span className={styles.rowMeta}>{r.kind === 'unknown' ? `? ${r.label}` : r.label}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}
