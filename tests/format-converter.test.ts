import { describe, expect, it } from 'vitest'
import { parseMarkdown } from 'chat'
import { ZaileysFormatConverter } from '../src/index.js'

const converter = new ZaileysFormatConverter()

describe('fromAst (mdast → WhatsApp)', () => {
  it('renders inline styles', () => {
    const out = converter.fromAst(parseMarkdown('**bold** _italic_ ~~strike~~ `code`'))
    expect(out).toBe('*bold* _italic_ ~strike~ `code`')
  })

  it('renders links as text (url)', () => {
    expect(converter.fromAst(parseMarkdown('[zaileys](https://example.com)'))).toBe(
      'zaileys (https://example.com)',
    )
    expect(converter.fromAst(parseMarkdown('<https://example.com>'))).toBe('https://example.com')
  })

  it('renders headings as bold and quotes with >', () => {
    expect(converter.fromAst(parseMarkdown('# Title'))).toBe('*Title*')
    expect(converter.fromAst(parseMarkdown('> quoted'))).toBe('> quoted')
  })

  it('renders lists', () => {
    const out = converter.fromAst(parseMarkdown('- one\n- two'))
    expect(out).toContain('one')
    expect(out).toContain('two')
  })

  it('renders code blocks fenced', () => {
    const out = converter.fromAst(parseMarkdown('```\nconst x = 1\n```'))
    expect(out).toBe('```const x = 1```')
  })
})

describe('toAst (WhatsApp → mdast)', () => {
  it('parses WhatsApp bold and strike into mdast', () => {
    const ast = converter.toAst('*bold* and ~gone~')
    const rendered = converter.fromAst(ast)
    expect(rendered).toBe('*bold* and ~gone~')
  })

  it('keeps plain text intact', () => {
    expect(converter.extractPlainText('hello world')).toBe('hello world')
  })
})
