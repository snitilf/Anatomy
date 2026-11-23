import { keepScript } from '../cli/script'
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
 * Writes what an agent needs into `.anatomy/`: the README, the topics in `guide/`, the JSON Schema, and `anatomy.mjs`,
 * which checks a board the way the app does. Each file stays as it is when the user took it over. The script is
 * optional for the agent, so a failure to write it changes nothing else.
 * It runs on Copy prompt, on Send, and in the background when a folder with a board opens.
 */
export async function writeAgentFiles(write: WorkspaceApi['writeFolderFile']): Promise<void> {
  // The text of the README, the guide, and the schema loads here, not with the first script.
  const { agentFiles } = await import('./agentReadme')
  await Promise.all([
    ...agentFiles().map((file) => write(file.name, file.text, { keep: file.keep })),
    anatomyScript().then((text) => (text === undefined ? false : write('anatomy.mjs', text, { keep: (existing) => keepScript(existing, text) }))),
  ])
}
