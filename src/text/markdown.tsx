/* eslint-disable react-refresh/only-export-components */
import type { JSX, ReactNode } from 'react'

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'code'; text: string }

export type Block =
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'list'; ordered: boolean; start: number; items: Inline[][] }

interface Allow {
  strong: boolean
  em: boolean
}

const ESCAPABLE = new Set(['*', '_', '`', '\\'])

function isSpace(ch: string | undefined): boolean {
  return ch === undefined || ch === ' ' || ch === '\t' || ch === '\n'
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{L}\p{N}]/u.test(ch)
}

/** Index of the next backtick that closes a code span opened at `open`, or -1. */
function findCodeEnd(s: string, open: number): number {
  const end = s.indexOf('`', open + 1)
  return end > open + 1 ? end : -1
}

/** The characters `findClose` has looked at, for tests to assert on. One integer increment each, and nothing reads it in the app. */
export const markdownStats = { scanned: 0 }

/**
 * Finds a valid closing marker at or after `from`.
 * Skips escapes and code spans.
 */
function findClose(s: string, from: number, marker: string): number {
  let j = from
  while (j < s.length) {
    markdownStats.scanned++
    const ch = s[j]
    if (ch === '\\' && ESCAPABLE.has(s[j + 1] ?? '')) {
      j += 2
      continue
    }
    if (ch === '`') {
      const end = findCodeEnd(s, j)
      if (end !== -1) {
        j = end + 1
        continue
      }
    }
    if (marker === '*' && ch === '*' && s[j + 1] === '*') {
      j += 2
      continue
    }
    if (s.startsWith(marker, j) && j > from && !isSpace(s[j - 1])) {
      if (marker === '_' && isWordChar(s[j + 1])) {
        j += 1
        continue
      }
      return j
    }
    j += 1
  }
  return -1
}

function parseInline(s: string, allow: Allow): Inline[] {
  const out: Inline[] = []
  let buf = ''
  const flush = (): void => {
    if (buf !== '') {
      out.push({ type: 'text', text: buf })
      buf = ''
    }
  }
  let i = 0
  while (i < s.length) {
    const ch = s[i] as string
    if (ch === '\\' && ESCAPABLE.has(s[i + 1] ?? '')) {
      buf += s[i + 1]
      i += 2
      continue
    }
    if (ch === '`') {
      const end = findCodeEnd(s, i)
      if (end !== -1) {
        flush()
        out.push({ type: 'code', text: s.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }
    if (ch === '*' && s[i + 1] === '*' && allow.strong && !isSpace(s[i + 2])) {
      const end = findClose(s, i + 2, '**')
      if (end !== -1) {
        flush()
        out.push({
          type: 'strong',
          children: parseInline(s.slice(i + 2, end), { strong: false, em: allow.em && allow.strong }),
        })
        i = end + 2
        continue
      }
    }
    if ((ch === '*' || ch === '_') && allow.em && !isSpace(s[i + 1])) {
      const okOpen = ch === '*' || !isWordChar(s[i - 1])
      if (okOpen && !(ch === '*' && s[i + 1] === '*' && allow.strong)) {
        const end = findClose(s, i + 1, ch)
        if (end !== -1) {
          flush()
          out.push({
            type: 'em',
            children: parseInline(s.slice(i + 1, end), { strong: allow.strong && allow.em, em: false }),
          })
          i = end + 1
          continue
        }
      }
    }
    buf += ch
    i += 1
  }
  flush()
  return out
}

const BULLET = /^[-*] (.*)$/
const NUMBERED = /^(\d{1,9})\. (.*)$/

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let para: string[] = []
  let list: { ordered: boolean; start: number; items: string[] } | null = null

  const flushPara = (): void => {
    if (para.length > 0) {
      blocks.push({ type: 'paragraph', children: parseInline(para.join(' '), { strong: true, em: true }) })
      para = []
    }
  }
  const flushList = (): void => {
    if (list) {
      blocks.push({
        type: 'list',
        ordered: list.ordered,
        start: list.start,
        items: list.items.map((item) => parseInline(item, { strong: true, em: true })),
      })
      list = null
    }
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (line === '') {
      flushPara()
      flushList()
      continue
    }
    const bullet = BULLET.exec(line)
    const numbered = bullet ? null : NUMBERED.exec(line)
    if (bullet || numbered) {
      const ordered = numbered !== null
      const text = ((bullet ?? numbered) as RegExpExecArray)[ordered ? 2 : 1] as string
      flushPara()
      if (list && list.ordered !== ordered) flushList()
      if (!list) {
        list = { ordered, start: numbered ? Number(numbered[1]) : 1, items: [] }
      }
      list.items.push(text.trim())
      continue
    }
    flushList()
    para.push(line)
  }
  flushPara()
  flushList()
  return blocks
}

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'text':
        return node.text
      case 'strong':
        return <strong key={i}>{renderInline(node.children)}</strong>
      case 'em':
        return <em key={i}>{renderInline(node.children)}</em>
      case 'code':
        return <code key={i}>{node.text}</code>
    }
  })
}

export function Markdown({ source, className }: { source: string; className?: string }): JSX.Element {
  const blocks = parseMarkdown(source)
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        if (block.type === 'paragraph') return <p key={i}>{renderInline(block.children)}</p>
        const items = block.items.map((item, j) => <li key={j}>{renderInline(item)}</li>)
        return block.ordered ? (
          <ol key={i} start={block.start}>
            {items}
          </ol>
        ) : (
          <ul key={i}>{items}</ul>
        )
      })}
    </div>
  )
}

function inlineText(nodes: Inline[]): string {
  return nodes
    .map((n) => (n.type === 'text' || n.type === 'code' ? n.text : inlineText(n.children)))
    .join('')
}

export function plainText(source: string): string {
  return parseMarkdown(source)
    .map((b) => (b.type === 'paragraph' ? inlineText(b.children) : b.items.map(inlineText).join('\n')))
    .join('\n')
}
