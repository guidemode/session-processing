/**
 * Markdown utilities for parsing, sanitizing, and truncating markdown content.
 * Uses marked for fast parsing and DOMPurify for XSS protection.
 */

// Conservative thresholds for content truncation
export const DEFAULT_TRUNCATION_THRESHOLD = {
  lines: 500,
  bytes: 50000, // 50KB
}

export interface ContentSize {
  lines: number
  bytes: number
}

export interface TruncationResult {
  truncated: string
  original: string
  isTruncated: boolean
  truncatedLines: number
  originalLines: number
}

export interface TruncationThreshold {
  lines: number
  bytes: number
}

/**
 * Parse markdown content to HTML using marked with syntax highlighting.
 * This is significantly faster than react-markdown (10-50x improvement).
 *
 * @param content - Raw markdown string
 * @param sanitize - Whether to sanitize output with DOMPurify (default: true)
 * @param enableSyntaxHighlighting - Whether to apply syntax highlighting to code blocks (default: true)
 * @returns Parsed and optionally sanitized HTML string
 */
export async function parseMarkdown(
  content: string,
  sanitize = true,
  enableSyntaxHighlighting = true
): Promise<string> {
  // Dynamic import to reduce bundle size
  const { marked } = await import('marked')

  // Load Prism for syntax highlighting with common languages
  let Prism: typeof import('prismjs') | null = null
  if (enableSyntaxHighlighting) {
    try {
      // Import base Prism (includes markup, css, clike, javascript)
      Prism = await import('prismjs')

      // Import common languages used in coding sessions
      // @ts-ignore - Prism language components exist but lack type definitions
      await import('prismjs/components/prism-typescript')
      // @ts-ignore - Prism language components exist but lack type definitions
      await import('prismjs/components/prism-tsx')
      // @ts-ignore - Prism language components exist but lack type definitions
      await import('prismjs/components/prism-jsx')
      // @ts-ignore - Prism language components exist but lack type definitions
      await import('prismjs/components/prism-python')
      // @ts-ignore - Prism language components exist but lack type definitions
      await import('prismjs/components/prism-bash')
      // @ts-ignore - Prism language components exist but lack type definitions
      await import('prismjs/components/prism-json')
      // @ts-ignore - Prism language components exist but lack type definitions
      await import('prismjs/components/prism-yaml')
      // @ts-ignore - Prism language components exist but lack type definitions
      await import('prismjs/components/prism-markdown')
      // @ts-ignore - Prism language components exist but lack type definitions
      await import('prismjs/components/prism-sql')
      // @ts-ignore - Prism language components exist but lack type definitions
      await import('prismjs/components/prism-rust')
      // @ts-ignore - Prism language components exist but lack type definitions
      await import('prismjs/components/prism-go')
      // @ts-ignore - Prism language components exist but lack type definitions
      await import('prismjs/components/prism-java')
    } catch (err) {
      console.warn('Failed to load Prism for syntax highlighting:', err)
    }
  }

  // Create custom renderer to add language classes and proper highlighting
  const renderer = new marked.Renderer()

  // Override code rendering to add language classes and syntax highlighting
  renderer.code = (code: string, language: string | undefined) => {
    const lang = language || 'plaintext'
    let highlightedCode = code

    // Apply Prism highlighting if available
    if (Prism && language && Prism.languages[language]) {
      try {
        highlightedCode = Prism.highlight(code, Prism.languages[language], language)
      } catch (err) {
        console.warn(`Failed to highlight ${language}:`, err)
      }
    }

    // Return pre > code with proper language class on BOTH elements
    // This ensures Prism CSS can target both pre[class*="language-"] and code[class*="language-"]
    return `<pre class="language-${lang}"><code class="language-${lang}">${highlightedCode}</code></pre>`
  }

  // Configure marked for GFM support
  marked.setOptions({
    gfm: true,
    breaks: true,
    renderer,
  })

  // Parse markdown to HTML
  const html = await marked.parse(content)

  // Sanitize if requested
  if (sanitize) {
    const DOMPurify = await import('dompurify')
    const purify = DOMPurify.default || DOMPurify

    return purify.sanitize(html, {
      ALLOWED_TAGS: [
        'p',
        'br',
        'strong',
        'em',
        'u',
        's',
        'code',
        'pre',
        'a',
        'ul',
        'ol',
        'li',
        'blockquote',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'table',
        'thead',
        'tbody',
        'tr',
        'td',
        'th',
        'img',
        'hr',
        'div',
        'span',
      ],
      ALLOWED_ATTR: ['href', 'title', 'src', 'alt', 'class', 'id', 'style'],
      ALLOW_DATA_ATTR: false,
    })
  }

  return html
}

/**
 * Calculate the size of content in lines and bytes.
 *
 * @param content - Text content to measure
 * @returns Object with line count and byte size
 */
export function getContentSize(content: string): ContentSize {
  const lines = content.split('\n').length
  const bytes = new TextEncoder().encode(content).length

  return { lines, bytes }
}

/**
 * Determine if content should be truncated based on threshold.
 *
 * @param content - Text content to check
 * @param threshold - Truncation threshold (default: 500 lines or 50KB)
 * @returns True if content exceeds threshold
 */
export function shouldTruncate(
  content: string,
  threshold: TruncationThreshold = DEFAULT_TRUNCATION_THRESHOLD
): boolean {
  const size = getContentSize(content)
  return size.lines > threshold.lines || size.bytes > threshold.bytes
}

/**
 * Truncate content to a maximum number of lines.
 *
 * @param content - Text content to truncate
 * @param maxLines - Maximum number of lines to keep
 * @returns Object with truncated content, original content, and truncation flag
 */
export function truncateContent(content: string, maxLines: number): TruncationResult {
  const lines = content.split('\n')
  const originalLines = lines.length

  if (originalLines <= maxLines) {
    return {
      truncated: content,
      original: content,
      isTruncated: false,
      truncatedLines: originalLines,
      originalLines,
    }
  }

  const truncatedLines = lines.slice(0, maxLines)
  const truncated = truncatedLines.join('\n')

  return {
    truncated,
    original: content,
    isTruncated: true,
    truncatedLines: maxLines,
    originalLines,
  }
}

/**
 * Smart truncation that considers threshold and returns appropriate content.
 *
 * @param content - Text content to potentially truncate
 * @param threshold - Truncation threshold (default: 500 lines or 50KB)
 * @returns Truncation result with appropriate content
 */
export function smartTruncate(
  content: string,
  threshold: TruncationThreshold = DEFAULT_TRUNCATION_THRESHOLD
): TruncationResult {
  if (!shouldTruncate(content, threshold)) {
    const lines = content.split('\n').length
    return {
      truncated: content,
      original: content,
      isTruncated: false,
      truncatedLines: lines,
      originalLines: lines,
    }
  }

  // Use the line threshold for truncation
  return truncateContent(content, threshold.lines)
}
