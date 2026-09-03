/**
 * Static style and icon maps for transcript spans.
 *
 * Deliberately static: Tailwind cannot see class names built by template literal, and
 * the safelist in each app's `tailwind.config.ts` is a backstop, not a licence to
 * construct classes at runtime.
 */

import {
  ArrowsPointingInIcon,
  ChatBubbleLeftRightIcon,
  CommandLineIcon,
  CpuChipIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  GlobeAltIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  MapIcon,
  PencilSquareIcon,
  QuestionMarkCircleIcon,
  RectangleStackIcon,
  SparklesIcon,
  StopCircleIcon,
  UserIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline'
import type React from 'react'
import type { EventKind, SpanKind } from '../../utils/transcript/spanTypes.js'

export type SpanTone = SpanKind | 'error'

/**
 * Compact typography for markdown rendered inside a span.
 *
 * Transcript content is a dense scanning surface, not an article: default heading
 * sizes make a plan or a long prompt dominate the page. These are arbitrary variants
 * rather than CSS so `index.css` stays byte-identical between server and desktop.
 */
export const TRANSCRIPT_PROSE = [
  'text-sm leading-relaxed',
  '[&_h1]:text-sm [&_h1]:font-semibold [&_h1]:mt-2 [&_h1]:mb-1',
  '[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1',
  '[&_h3]:text-xs [&_h3]:font-semibold [&_h3]:uppercase [&_h3]:tracking-wide',
  '[&_h3]:text-base-content/60 [&_h3]:mt-2 [&_h3]:mb-0.5',
  '[&_h4]:text-xs [&_h4]:font-semibold [&_h4]:mt-1.5 [&_h4]:mb-0.5',
  '[&_p]:my-1',
  '[&_ul]:my-1 [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:pl-4 [&_li]:my-0.5',
  '[&_pre]:my-1 [&_pre]:text-xs',
  '[&_code]:text-xs',
  '[&_table]:text-xs',
  '[&_blockquote]:my-1 [&_blockquote]:pl-2 [&_blockquote]:border-l-2',
  '[&_blockquote]:border-base-300 [&_blockquote]:text-base-content/70',
  '[&_hr]:my-2',
].join(' ')

export interface SpanStyle {
  /** Left accent border on the row. */
  border: string
  /** Icon colour in the node rail. */
  icon: string
  /** Tinted background for the icon node. */
  node: string
  /** Density-strip / legend swatch. */
  swatch: string
  label: string
}

export const SPAN_STYLES: Record<SpanTone, SpanStyle> = {
  human: {
    border: 'border-l-primary/35',
    icon: 'text-primary',
    node: 'bg-primary/10',
    swatch: 'bg-primary/40',
    label: 'human',
  },
  assistant: {
    border: 'border-l-warning/35',
    icon: 'text-warning',
    node: 'bg-warning/10',
    swatch: 'bg-warning/40',
    label: 'assistant',
  },
  tools: {
    border: 'border-l-secondary/35',
    icon: 'text-secondary',
    node: 'bg-secondary/10',
    swatch: 'bg-secondary/40',
    label: 'tools',
  },
  meta: {
    border: 'border-l-neutral/30',
    icon: 'text-base-content/50',
    node: 'bg-neutral/10',
    swatch: 'bg-neutral/20',
    label: 'metadata',
  },
  event: {
    border: 'border-l-accent/35',
    icon: 'text-accent',
    node: 'bg-accent/10',
    swatch: 'bg-accent/40',
    label: 'event',
  },
  error: {
    border: 'border-l-error/35',
    icon: 'text-error',
    node: 'bg-error/10',
    swatch: 'bg-error/40',
    label: 'error',
  },
}

/** Legend entries, in the order the prototype shows them. */
export const LEGEND_TONES: SpanTone[] = ['human', 'assistant', 'tools', 'error', 'meta']

type Icon = React.ComponentType<{ className?: string }>

export const SPAN_ICONS: Record<SpanKind, Icon> = {
  human: UserIcon,
  assistant: CpuChipIcon,
  tools: CommandLineIcon,
  meta: RectangleStackIcon,
  event: SparklesIcon,
}

export const EVENT_ICONS: Record<EventKind, Icon> = {
  interruption: StopCircleIcon,
  plan: MapIcon,
  question: QuestionMarkCircleIcon,
  compact: ArrowsPointingInIcon,
  summary: DocumentTextIcon,
}

/** Events that are trouble rather than progress, and so render in the error tone. */
export const ERROR_EVENTS = new Set<EventKind>(['interruption'])

const TOOL_ICONS: Array<[RegExp, Icon]> = [
  [/^(bash|shell)$/i, CommandLineIcon],
  [/^(read|notebookread)$/i, EyeIcon],
  [/^(edit|write|multiedit|notebookedit|str_replace_editor)$/i, PencilSquareIcon],
  [/^(grep|glob)$/i, MagnifyingGlassIcon],
  [/^(task|agent)$/i, RectangleStackIcon],
  [/^(webfetch|websearch)$/i, GlobeAltIcon],
  [/^todowrite$/i, ListBulletIcon],
  [/^exitplanmode$/i, MapIcon],
  [/^askuserquestion$/i, ChatBubbleLeftRightIcon],
  [/^sendmessage$/i, ChatBubbleLeftRightIcon],
]

export function iconForTool(toolName: string): Icon {
  const bare = toolName.replace(/^mcp__[^_]+(?:_[^_]+)*?__/, '')
  const match = TOOL_ICONS.find(([pattern]) => pattern.test(bare))
  return match ? match[1] : WrenchScrewdriverIcon
}

export const STATUS_BADGES = {
  ok: 'badge-ghost',
  error: 'badge-error',
  pending: 'badge-warning',
} as const

export { ExclamationTriangleIcon }
