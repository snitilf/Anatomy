import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { installViolationRecorder, recordViolations, type ContextLike, type PageLike, type Violation } from './violations.ts'

const violation = (directive = 'connect-src'): Violation => ({ directive, blocked: 'http://other.test/', sample: '', source: '' })

function deferred<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

type Browser = Window & { __anatomyViolation: (v: unknown) => Promise<void>; __anatomyFlush: () => Promise<void> }
const browser = () => window as unknown as Browser

/** What the browser does when the policy blocks something: it queues a `securitypolicyviolation` event. */
const block = () => document.dispatchEvent(Object.assign(new Event('securitypolicyviolation'), { violatedDirective: 'connect-src', blockedURI: 'x', sample: '', sourceFile: '' }))

describe('the page side of the recorder', () => {
  const calls: unknown[] = []
  let answer: () => Promise<void> = () => Promise.resolve()

  beforeAll(() => {
    // The listener is added once. The test process answers through `answer`.
    browser().__anatomyViolation = (v) => {
      calls.push(v)
      return answer()
    }
    installViolationRecorder()
  })
  beforeEach(() => {
    calls.length = 0
    answer = () => Promise.resolve()
    vi.useFakeTimers()
    return () => {
      vi.useRealTimers()
    }
  })

  it('reports the directive, the blocked address, the sample, and the source file', async () => {
    block()
    await browser().__anatomyFlush().catch(() => undefined)
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toEqual([{ directive: 'connect-src', blocked: 'x', sample: '', source: '' }])
  })

  it('waits for a call that is still on its way to the test', async () => {
    const slow = deferred()
    answer = () => slow.promise
    block()
    let done = false
    const flush = browser().__anatomyFlush().then(() => (done = true))
    await vi.advanceTimersByTimeAsync(1000)
    expect(done).toBe(false)
    slow.resolve()
    await flush
    expect(done).toBe(true)
  })

  it('yields a task first, so an event that is already queued is caught', async () => {
    // The event is queued before the flush starts, as the browser does when a blocked request is the last step of a test.
    setTimeout(block, 0)
    const slow = deferred()
    answer = () => slow.promise
    let done = false
    const flush = browser().__anatomyFlush().then(() => (done = true))
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(10)
    expect(done).toBe(false)
    slow.resolve()
    await flush
  })

  it('also waits for a violation that arrives while it waits for another', async () => {
    const first = deferred()
    const second = deferred()
    const answers = [first.promise, second.promise]
    answer = () => answers.shift()!
    block()
    let done = false
    const flush = browser().__anatomyFlush().then(() => (done = true))
    await vi.advanceTimersByTimeAsync(0)
    block()
    first.resolve()
    await vi.advanceTimersByTimeAsync(10)
    expect(calls).toHaveLength(2)
    expect(done).toBe(false)
    second.resolve()
    await flush
    expect(done).toBe(true)
  })
})

/** A context that hands the binding to the test, and pages whose frames answer the flush the way the browser would. */
function fakeContext(pages: PageLike[] = []) {
  let report: ((source: unknown, v: Violation) => void) | undefined
  const context: ContextLike = {
    exposeBinding: async (_name, callback) => {
      report = callback
    },
    addInitScript: async () => undefined,
    pages: () => pages,
  }
  return { context, report: (v: Violation) => report?.({}, v) }
}

const page = (frames: { evaluate: () => Promise<unknown> }[], closed = false): PageLike => ({ isClosed: () => closed, frames: () => frames })

describe('the check at the end of a test', () => {
  it('passes when nothing was blocked, and still flushes every page', async () => {
    const evaluate = vi.fn(async () => undefined)
    const { context } = fakeContext([page([{ evaluate }]), page([{ evaluate }])])
    const recorder = await recordViolations(context)
    await expect(recorder.finish()).resolves.toBeUndefined()
    expect(evaluate).toHaveBeenCalledTimes(2)
  })

  it('stays pending until the flush of the page is done, then fails with the violation', async () => {
    const flushed = deferred()
    const fake = fakeContext()
    const evaluate = vi.fn(async () => {
      // The page reports the violation, and the flush ends only when the report has arrived.
      await Promise.resolve()
      fake.report(violation())
      await flushed.promise
    })
    fake.context.pages = () => [page([{ evaluate }])]
    const recorder = await recordViolations(fake.context)
    let settled = false
    const done = recorder.finish().then(
      () => (settled = true),
      () => (settled = true),
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(settled).toBe(false)
    flushed.resolve()
    await done
    expect(settled).toBe(true)
    expect(recorder.list).toEqual([violation()])
  })

  it('fails with the message and the violation that arrived while it flushed', async () => {
    const fake = fakeContext()
    fake.context.pages = () => [
      page([
        {
          evaluate: async () => {
            fake.report(violation('script-src-elem'))
          },
        },
      ]),
    ]
    const recorder = await recordViolations(fake.context)
    await expect(recorder.finish()).rejects.toThrow(/^the page broke its Content Security Policy.*script-src-elem/s)
  })

  it('flushes a second page and every frame of it', async () => {
    const fake = fakeContext()
    const first = vi.fn(async () => undefined)
    const child = vi.fn(async () => undefined)
    const late = vi.fn(async () => {
      fake.report(violation())
    })
    fake.context.pages = () => [page([{ evaluate: first }]), page([{ evaluate: child }, { evaluate: late }])]
    const recorder = await recordViolations(fake.context)
    await expect(recorder.finish()).rejects.toThrow('the page broke its Content Security Policy')
    expect(first).toHaveBeenCalledOnce()
    expect(child).toHaveBeenCalledOnce()
    expect(late).toHaveBeenCalledOnce()
  })

  it('skips a closed page without asking for its frames', async () => {
    const frames = vi.fn(() => {
      throw new Error('closed')
    })
    const { context } = fakeContext([{ isClosed: () => true, frames }])
    const recorder = await recordViolations(context)
    await expect(recorder.finish()).resolves.toBeUndefined()
    expect(frames).not.toHaveBeenCalled()
  })

  it('goes on when a frame is detached or navigating, and still reports what was seen', async () => {
    const fake = fakeContext()
    const ok = vi.fn(async () => {
      fake.report(violation())
    })
    fake.context.pages = () => [page([{ evaluate: async () => Promise.reject(new Error('Execution context was destroyed')) }, { evaluate: ok }])]
    const recorder = await recordViolations(fake.context)
    await expect(recorder.finish()).rejects.toThrow('the page broke its Content Security Policy')
    expect(ok).toHaveBeenCalledOnce()
  })

  it('hands a violation over once with take, so a test can break the policy on purpose', async () => {
    const fake = fakeContext()
    const recorder = await recordViolations(fake.context)
    fake.report(violation())
    expect(recorder.take()).toEqual([violation()])
    expect(recorder.list).toEqual([])
    await expect(recorder.finish()).resolves.toBeUndefined()
  })
})
