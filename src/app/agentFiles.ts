import { keepScript } from '../cli/script'
import { agentReadme, keepReadme } from './agentReadme'
import type { WorkspaceApi } from './workspaceContext'

/** The bundled `anatomy` tool. It loads on first use, so it never weighs on the first paint. Undefined when it cannot load. */
async function anatomyScript(): Promise<string | undefined> {
  try {
    return (await import('virtual:anatomy-cli')).default
  } catch {
    return undefined
  }
}

/**
 * Writes what an agent needs into `.anatomy/`: the README, and `anatomy.mjs`, which checks a board the way the app does.
 * Each file stays as it is when the user took it over. The script is optional for the agent, so a failure to write it
 * changes nothing else.
 */
export async function writeAgentFiles(write: WorkspaceApi['writeFolderFile']): Promise<void> {
  await Promise.all([
    write('README.md', agentReadme(), { keep: keepReadme }),
    anatomyScript().then((text) => (text === undefined ? false : write('anatomy.mjs', text, { keep: (existing) => keepScript(existing, text) }))),
  ])
}
