import clsx from 'clsx'
import { lazy, Suspense, useId, type ReactNode } from 'react'
import { useCommand } from '../commands/context'
import buttons from './buttons.module.css'
import { ChunkBoundary } from './ChunkBoundary'
import styles from './EmptyState.module.css'
import { EXAMPLES, openExample, type Example } from './examples'
import { SavedBoardList } from './SavedBoards'
import { useWorkspace } from './workspaceContext'

// The outlines and the code that draw them load on their own script, right after the start screen first paints. A card still works without them.
const MapPreview = lazy(() => import('./ExamplePreview').then((m) => ({ default: m.MapPreview })))
const MapCounts = lazy(() => import('./ExamplePreview').then((m) => ({ default: m.MapCounts })))

/** The first line, an optional second line, and the actions, which depend on the folder and the browser. */
function Lead() {
  const { folder, canOpenFolder, openFolder, reopenFolder } = useWorkspace()
  const openFile = useCommand('open.file')
  const copyPrompt = useCommand('copy.prompt')
  const howTo = useCommand('howto')
  const primary = clsx(buttons.button, buttons.primary, buttons.large)
  const secondary = clsx(buttons.button, buttons.large)

  if (folder?.state === 'missing') {
    return (
      <header className={styles.lead}>
        <h1 className={styles.title}>{folder.name} has no board yet.</h1>
        <p className={styles.hint}>
          It opens here when your agent writes <code className={styles.path}>.anatomy/board.json</code>.
        </p>
        <div className={styles.actions}>
          <button type="button" className={primary} onClick={copyPrompt.run}>
            Copy prompt
          </button>
          <button type="button" className={secondary} onClick={howTo.run}>
            How to make a board
          </button>
        </div>
      </header>
    )
  }
  const fileButton = (main: boolean) => (
    <button type="button" className={main ? primary : secondary} onClick={openFile.run}>
      Open file
    </button>
  )
  return (
    <header className={styles.lead}>
      <h1 className={styles.title}>Open a repository to see its anatomy.</h1>
      {!canOpenFolder && <p className={styles.hint}>This browser cannot open folders. Chrome and Edge can.</p>}
      <div className={styles.actions}>
        {canOpenFolder && folder?.state === 'reopen' && (
          <>
            <button type="button" className={primary} onClick={reopenFolder}>
              Reopen {folder.name}
            </button>
            <button type="button" className={secondary} onClick={openFolder}>
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

interface Step {
  title: string
  body: ReactNode
}

/** What to do with your own agent. The prompt lives in the how-to dialog in every browser, and only a browser that can open folders watches one. */
function Steps() {
  const { canOpenFolder } = useWorkspace()
  const howTo = useCommand('howto')
  const steps: readonly Step[] = [
    { title: 'Copy the prompt', body: `Open Settings, then ${howTo.label}.` },
    {
      title: 'Give it to your agent',
      body: canOpenFolder ? (
        <>
          It writes <code className={styles.path}>.anatomy/board.json</code> in your project.
        </>
      ) : (
        'Save the JSON it writes as a file.'
      ),
    },
    { title: canOpenFolder ? 'Open the project folder' : 'Open that file', body: 'The map opens here. Explore it, mark it up, and send questions back.' },
  ]
  return (
    <section className={clsx(styles.section, styles.steps)} aria-labelledby="steps-title">
      <h2 className={styles.sectionTitle} id="steps-title">
        With your own agent
      </h2>
      <ol className={styles.stepList} data-testid="start-steps">
        {steps.map((step, i) => (
          <li key={step.title} className={styles.step}>
            <span aria-hidden="true">
              {i + 1}
            </span>
            <span>
              <span>{step.title}</span>
              <span>{step.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** One example as a button. The title names it, and the description and counts are its description. */
function ExampleCard({ example }: { example: Example }) {
  const { openText } = useWorkspace()
  const id = useId()
  return (
    <button
      type="button"
      className={styles.card}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-text ${id}-meta`}
      onClick={() => {
        void openExample(example, (fileName, text) => openText(fileName, text, 'example'))
      }}
    >
      <span className={styles.preview} data-testid={`example-preview-${example.id}`} aria-hidden="true">
        <ChunkBoundary fallback={null}>
          <Suspense fallback={null}>
            <MapPreview example={example} className={styles.map} />
          </Suspense>
        </ChunkBoundary>
      </span>
      <span className={styles.cardBody}>
        <strong id={`${id}-title`}>
          {example.title}
        </strong>
        <span id={`${id}-text`}>
          {example.description}
        </span>
        <small>
          <ChunkBoundary fallback={null}>
            <Suspense fallback={null}>
              <MapCounts example={example} id={`${id}-meta`} />
            </Suspense>
          </ChunkBoundary>
        </small>
      </span>
    </button>
  )
}

export function EmptyState() {
  const { saved, unavailable } = useWorkspace()
  return (
    <div className={styles.empty}>
      <div className={styles.column}>
        <Lead />
        {unavailable && (
          <p className={styles.problem} role="status">
            This browser blocks storage here, so nothing is saved. Download a copy to keep your work.
          </p>
        )}
        {saved.length > 0 && (
          <section className={clsx(styles.section, styles.recent)} aria-labelledby="recent-title">
            <h2 className={styles.sectionTitle} id="recent-title">
              Recent
            </h2>
            <SavedBoardList />
          </section>
        )}
        <section className={styles.section} aria-labelledby="examples-title">
          <h2 className={styles.sectionTitle} id="examples-title">
            Examples
          </h2>
          <ul className={styles.examples}>
            {EXAMPLES.map((example) => (
              <li key={example.id} className={styles.item}>
                <ExampleCard example={example} />
              </li>
            ))}
          </ul>
        </section>
        <Steps />
      </div>
    </div>
  )
}
