import { StorageError } from './store'

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | { error: StorageError }

export interface SaveQueue<T> {
  /** Replaces any waiting value and restarts the delay. */
  schedule(value: T): void
  /** Writes the latest value now. Resolves when nothing is waiting or in flight. */
  flush(): Promise<void>
  /** Writes the kept value again after a failure. */
  retry(): Promise<void>
  onStatus(listener: (status: SaveStatus) => void): () => void
  /** Drops the waiting value and the timer. Does not stop a save already running. */
  cancel(): void
}

/**
 * Debounced, coalescing writer. Only the newest value is written,
 * and two saves never run at the same time.
 * A failed value stays queued until a later schedule, retry or flush writes it.
 */
export function createSaveQueue<T>(save: (value: T) => Promise<void>, delayMs = 400): SaveQueue<T> {
  const listeners = new Set<(status: SaveStatus) => void>()
  let latest: { value: T } | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<void> | undefined

  function emit(status: SaveStatus) {
    for (const listener of [...listeners]) listener(status)
  }

  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  function drain(): Promise<void> {
    if (running) return running
    running = (async () => {
      try {
        while (latest) {
          const job = latest
          latest = undefined
          emit('saving')
          try {
            await save(job.value)
          } catch (error) {
            // Keep the value unless a newer one arrived while saving.
            latest ??= job
            emit({
              error:
                error instanceof StorageError
                  ? error
                  : new StorageError('failed', 'Could not save.', { cause: error }),
            })
            return
          }
          emit(latest ? 'pending' : 'saved')
        }
      } finally {
        running = undefined
      }
    })()
    return running
  }

  function flush(): Promise<void> {
    clearTimer()
    // drain() joins a save in flight and keeps going until nothing newer waits.
    return drain()
  }

  return {
    schedule(value) {
      latest = { value }
      clearTimer()
      emit('pending')
      timer = setTimeout(() => {
        timer = undefined
        void drain()
      }, delayMs)
    },
    flush,
    retry: flush,
    onStatus(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    cancel() {
      clearTimer()
      latest = undefined
    },
  }
}
