import clsx from 'clsx'
import { useCommand } from '../commands/context'
import buttons from './buttons.module.css'
import styles from './EmptyState.module.css'
import { EXAMPLES, openExample } from './examples'
import type { BoardOutline } from './outline'
import { SavedBoardList } from './SavedBoards'
import { useWorkspace } from './workspaceContext'

const STEPS = [
  ['Open your project', 'Pick a folder to watch, or open a board file.', ''],
  ['Paste the prompt', 'Give it to your agent to write ', '.anatomy/board.json'],
  ['The map opens here', 'Explore it, mark it up, and send questions back.', ''],
] as const

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

function outlineMeta(o: BoardOutline | undefined): string | null {
  if (!o) return null
  const parts = plural(o.parts, 'part')
  return o.walkthroughs > 0 ? `${parts} · ${plural(o.walkthroughs, 'walkthrough')}` : parts
}

/** The first line, an optional second line, and the actions, which depend on the folder and the browser. */
function Lead() {
  const { folder, canOpenFolder, openFolder, reopenFolder } = useWorkspace()
  const openFile = useCommand('open.file')
  const copyPrompt = useCommand('copy.prompt')
  const howTo = useCommand('howto')
  const primary = clsx(buttons.button, buttons.primary)

  if (folder?.state === 'missing') {
    return (
      <header>
        <h2>{folder.name} has no board yet.</h2>
        <p>
          It opens here when your agent writes <code>.anatomy/board.json</code>.
        </p>
        <div>
          <button type="button" className={primary} onClick={copyPrompt.run}>
            Copy prompt
          </button>
          <button type="button" className={buttons.button} onClick={howTo.run}>
            How to make a board
          </button>
        </div>
      </header>
    )
  }
  const fileButton = (main: boolean) => (
    <button type="button" className={main ? primary : buttons.button} onClick={openFile.run}>
      Open file
    </button>
  )
  return (
    <header>
      <h2>Open a repository to see its anatomy.</h2>
      {!canOpenFolder && <p>This browser cannot open folders. Chrome and Edge can.</p>}
      <div>
        {canOpenFolder && folder?.state === 'reopen' && (
          <>
            <button type="button" className={primary} onClick={reopenFolder}>
              Reopen {folder.name}
            </button>
            <button type="button" className={buttons.button} onClick={openFolder}>
              Open another folder
            </button>
          </>
        )}
        {canOpenFolder && folder?.state !== 'reopen' && (
          <button type="button" className={primary} onClick={openFolder}>
            Open folder
          </button>
        )}
        {fileButton(!canOpenFolder)}
      </div>
    </header>
  )
}

export function EmptyState() {
  const { saved, unavailable, openText } = useWorkspace()
  return (
    <div className={styles.empty}>
      <div>
        <Lead />
        {unavailable && (
          <p role="status">
            This browser blocks storage here, so nothing is saved. Download a copy to keep your work.
          </p>
        )}
        {saved.length > 0 && (
          <section aria-labelledby="recent-title">
            <h3 id="recent-title">Recent</h3>
            <SavedBoardList />
          </section>
        )}
        <section aria-labelledby="examples-title">
          <h3 id="examples-title">Examples</h3>
          <ul>
            {EXAMPLES.map((example) => {
              const o = example.outline
              const meta = outlineMeta(o)
              return (
                <li key={example.id}>
                  <button
                    type="button"
                    onClick={() => {
                      void openExample(example, (fileName, text) => openText(fileName, text, 'example'))
                    }}
                  >
                    <div data-testid={`example-preview-${example.id}`} aria-hidden="true">
                      <svg viewBox={`0 0 ${o && o.width > 0 ? o.width : 40} ${o && o.height > 0 ? o.height : 25}`} preserveAspectRatio="xMidYMid meet">
                        {o?.groups.map((g, i) => (
                          <rect key={i} data-outline-group="" x={g.x} y={g.y} width={g.w} height={g.h} rx={2.5} />
                        ))}
                        {o?.lines.map((d, i) => (
                          <path key={i} data-outline-line="" d={d} />
                        ))}
                        {o?.cards.map((c, i) => (
                          <g key={i} data-outline-card="">
                            <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={1.5} />
                            <rect x={c.x + 3} y={c.y + c.h * 0.28} width={c.w * 0.54} height={Math.max(1.2, c.h * 0.13)} rx={0.8} />
                            <rect x={c.x + 3} y={c.y + c.h * 0.56} width={c.w * 0.72} height={Math.max(1, c.h * 0.1)} rx={0.6} />
                          </g>
                        ))}
                      </svg>
                    </div>
                    <span>
                      <strong>{example.title}</strong>
                      <span>{example.description}</span>
                      {meta && <small>{meta}</small>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
        <section aria-labelledby="steps-title">
          <h3 id="steps-title">With your own agent</h3>
          <ol data-testid="start-steps">
            {STEPS.map(([title, body, code], i) => (
              <li key={title}>
                <span aria-hidden="true">{i + 1}</span>
                <div>
                  <p>{title}</p>
                  <p>
                    {body}
                    {code && (
                      <>
                        <code>{code}</code>.
                      </>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}
