import type { Sent } from '../layer/model'

/**
 * Whether the app is waiting for the agent: something was sent on the revision that is open, it has no answer yet, and the user
 * has nothing new to send. A higher revision ends the wait, because the agent has written, and new items take the Send button back.
 */
export function waitingForAgent({ sent, revision, unanswered, unsent }: { sent: Pick<Sent, 'baseRevision'> | undefined; revision: number; unanswered: number; unsent: number }): boolean {
  return sent !== undefined && sent.baseRevision >= revision && unanswered > 0 && unsent === 0
}
