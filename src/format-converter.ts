import { BaseFormatConverter, parseMarkdown } from 'chat'
import type { Content, Root } from 'chat'

/**
 * Format converter between WhatsApp markup and mdast.
 *
 * WhatsApp: `*bold*`, `_italic_`, `~strike~`, `` `code` ``, ``` ```block``` ```,
 * `> quote`, `- list`. Markdown links are not supported — rendered as `text (url)`.
 */
export class ZaileysFormatConverter extends BaseFormatConverter {
  toAst(platformText: string): Root {
    const markdown = platformText
      .replace(/(?<![*\w])\*([^*\n]+)\*(?![*\w])/g, '**$1**')
      .replace(/(?<![~\w])~([^~\n]+)~(?![~\w])/g, '~~$1~~')
    return parseMarkdown(markdown)
  }

  fromAst(ast: Root): string {
    return this.fromAstWithNodeConverter(ast, (node) => this.convertNode(node))
  }

  private convertNode(node: Content): string {
    switch (node.type) {
      case 'text':
        return node.value
      case 'strong':
        return `*${this.convertChildren(node)}*`
      case 'emphasis':
        return `_${this.convertChildren(node)}_`
      case 'delete':
        return `~${this.convertChildren(node)}~`
      case 'inlineCode':
        return `\`${node.value}\``
      case 'code':
        return `\`\`\`${node.value}\`\`\``
      case 'link': {
        const label = this.convertChildren(node)
        return label && label !== node.url ? `${label} (${node.url})` : node.url
      }
      case 'image':
        return node.url
      case 'heading':
        return `*${this.convertChildren(node)}*`
      case 'paragraph':
        return this.convertChildren(node)
      case 'blockquote':
        return this.convertChildren(node)
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n')
      case 'list':
        return this.renderList(node, 0, (n) => this.convertNode(n), '-')
      case 'thematicBreak':
        return '———'
      case 'break':
        return '\n'
      default:
        return this.defaultNodeToText(node, (n) => this.convertNode(n))
    }
  }

  private convertChildren(node: Content): string {
    if (!('children' in node) || !Array.isArray(node.children)) return ''
    return (node.children as Content[]).map((child) => this.convertNode(child)).join('')
  }
}
