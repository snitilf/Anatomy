import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Markdown, parseMarkdown, plainText } from './markdown'
import { fastestMs } from '../test/timing'

function html(source: string): string {
  const { container } = render(<Markdown source={source} />)
  return (container.firstElementChild as HTMLElement).innerHTML
}

describe('blocks', () => {
  it('splits paragraphs on blank lines and soft-wraps single newlines', () => {
    expect(html('one\ntwo\n\n\n\nthree')).toBe('<p>one two</p><p>three</p>')
  })

  it('renders unordered lists with both markers', () => {
    expect(html('- a\n* b')).toBe('<ul><li>a</li><li>b</li></ul>')
  })

  it('renders ordered lists with the first number as start', () => {
    expect(html('3. a\n4. b')).toBe('<ol start="3"><li>a</li><li>b</li></ol>')
  })

  it('ends a list on a blank line or a plain line', () => {
    const blocks = parseMarkdown('- a\n\n- b\nplain')
    expect(blocks.map((b) => b.type)).toEqual(['list', 'list', 'paragraph'])
  })

  it('trims indent on list lines and does not nest', () => {
    expect(html('- a\n    - b')).toBe('<ul><li>a</li><li>b</li></ul>')
  })

  it('splits a list when the type changes', () => {
    expect(parseMarkdown('- a\n1. b').map((b) => b.type)).toEqual(['list', 'list'])
  })

  it('handles CRLF line endings', () => {
    expect(html('a\r\nb\r\n\r\n- c\r\n- d')).toBe('<p>a b</p><ul><li>c</li><li>d</li></ul>')
  })

  it('returns nothing for empty or whitespace input', () => {
    expect(parseMarkdown('')).toEqual([])
    expect(parseMarkdown('  \n \r\n\t')).toEqual([])
    expect(html('   ')).toBe('')
  })
})

describe('inline', () => {
  it('renders bold, italic, underscore italic and code', () => {
    expect(html('**b** *i* _u_ `c`')).toBe(
      '<p><strong>b</strong> <em>i</em> <em>u</em> <code>c</code></p>',
    )
  })

  it('keeps code spans literal', () => {
    expect(html('`**a** _b_`')).toBe('<p><code>**a** _b_</code></p>')
  })

  it('nests bold and italic one level', () => {
    expect(html('**a *b* c**')).toBe('<p><strong>a <em>b</em> c</strong></p>')
    expect(html('*a **b** c*')).toBe('<p><em>a <strong>b</strong> c</em></p>')
  })

  it('renders unmatched markers literally', () => {
    expect(html('**a')).toBe('<p>**a</p>')
    expect(html('a * b')).toBe('<p>a * b</p>')
    expect(html('`a')).toBe('<p>`a</p>')
    expect(html('snake_case_name')).toBe('<p>snake_case_name</p>')
  })

  it('handles backslash escapes', () => {
    expect(html('\\*a\\* \\_b\\_ \\`c\\` \\\\')).toBe('<p>*a* _b_ `c` \\</p>')
  })
})

describe('untrusted text', () => {
  it('shows HTML as literal text and creates no elements', () => {
    const { container } = render(<Markdown source={'<script>alert(1)</script> <img src=x onerror=y>'} />)
    expect(container.querySelector('script, a, img')).toBeNull()
    expect(container.textContent).toBe('<script>alert(1)</script> <img src=x onerror=y>')
  })

  it('shows links and images literally', () => {
    const { container } = render(<Markdown source={'[l](http://x) ![i](http://y)'} />)
    expect(container.querySelector('a, img')).toBeNull()
    expect(container.textContent).toBe('[l](http://x) ![i](http://y)')
  })

  it('keeps headings and blockquotes literal', () => {
    const { container } = render(<Markdown source={'# Title\n\n> quote'} />)
    expect(container.querySelector('h1, blockquote')).toBeNull()
    expect(container.textContent).toBe('# Title> quote')
  })
})

describe('performance', () => {
  it('handles adversarial input quickly', () => {
    for (const input of ['*'.repeat(4000), '**_`'.repeat(1000), '*a '.repeat(1333), '_a'.repeat(2000)]) {
      expect(fastestMs(() => parseMarkdown(input), 200)).toBeLessThan(200)
    }
  })
})

describe('plainText', () => {
  it('strips markup', () => {
    expect(plainText('**a** *b* `c` \\*d')).toBe('a b c *d')
  })

  it('joins blocks and list items with newlines', () => {
    expect(plainText('x\n\n- a\n- b')).toBe('x\na\nb')
  })

  it('returns empty for empty input', () => {
    expect(plainText('')).toBe('')
  })
})
