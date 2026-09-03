/**
 * The single entry point both apps use: raw JSONL in, renderable model out.
 *
 * Order of operations matters and is fixed here — see `filterSpans` for why the
 * message-level filters must run BEFORE derivation.
 */

import { useMemo } from 'react'
import { parserRegistry } from '../../../parsers/registry.js'
import { extractMessageTokens } from '../../utils/extractTokens.js'
import { processorRegistry } from '../../utils/processors/ProcessorRegistry.js'
import { deriveSpans } from '../../utils/transcript/deriveSpans.js'
import { prefilterMessages, projectSpans } from '../../utils/transcript/filterSpans.js'
import type { ProjectedSpan } from '../../utils/transcript/filterSpans.js'
import type { SpanLabelProvider } from '../../utils/transcript/spanLabels.js'
import type { TranscriptSummary } from '../../utils/transcript/spanTypes.js'

/** Claude's context window, and the basis for the header's context readout. */
export const DEFAULT_CONTEXT_WINDOW = 200_000

export interface UseTranscriptModelOptions {
  content: string
  provider: string
  showMetaMessages: boolean
  showThinkingBlocks: boolean
  searchQuery: string
  messageFilter: string
  labelProvider?: SpanLabelProvider
}

export interface TranscriptModelResult {
  /** False when the content could not be parsed as a session at all. */
  parsed: boolean
  projected: ProjectedSpan[]
  summary: TranscriptSummary
  totalSpans: number
  peakContextTokens: number | null
}

const EMPTY_SUMMARY: TranscriptSummary = {
  records: 0,
  human: 0,
  assistant: 0,
  toolCalls: 0,
  toolPairs: 0,
  toolPending: 0,
  errors: 0,
  meta: 0,
  events: 0,
  strip: [],
}

export function useTranscriptModel({
  content,
  provider,
  showMetaMessages,
  showThinkingBlocks,
  searchQuery,
  messageFilter,
  labelProvider,
}: UseTranscriptModelOptions): TranscriptModelResult {
  // Parsing and derivation are the expensive half; filters are cheap, so they are
  // memoized separately and a keystroke in the search box does not re-parse the file.
  const derived = useMemo(() => {
    // Blank content is the normal loading state, not a parse failure.
    if (!content.trim()) return null

    try {
      const parser = parserRegistry.getParser(provider)
      if (!parser) return null

      const messages = parser.parseSession(content).messages.map(msg => ({
        ...msg,
        timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : msg.timestamp,
      }))
      const normalized = processorRegistry.getProcessor(provider).normalizeAll(messages)

      // Peak cached context across the session — what the token chart's gauge showed.
      let peak = 0
      for (const message of normalized) {
        const { cacheRead, input } = extractMessageTokens(message)
        peak = Math.max(peak, cacheRead + input)
      }

      return { normalized, peakContextTokens: peak > 0 ? peak : null }
    } catch (error) {
      console.warn('Failed to parse session content:', error)
      return null
    }
  }, [content, provider])

  const model = useMemo(() => {
    if (!derived) return null
    const messages = prefilterMessages(derived.normalized, {
      showMetaMessages,
      showThinkingBlocks,
    })
    return deriveSpans(messages, { labelProvider })
  }, [derived, showMetaMessages, showThinkingBlocks, labelProvider])

  const projected = useMemo(
    () => (model ? projectSpans(model.spans, { messageFilter, searchQuery }) : []),
    [model, messageFilter, searchQuery]
  )

  if (!model || !derived) {
    return {
      parsed: false,
      projected: [],
      summary: EMPTY_SUMMARY,
      totalSpans: 0,
      peakContextTokens: null,
    }
  }

  return {
    parsed: true,
    projected,
    summary: model.summary,
    totalSpans: model.spans.length,
    peakContextTokens: derived.peakContextTokens,
  }
}
