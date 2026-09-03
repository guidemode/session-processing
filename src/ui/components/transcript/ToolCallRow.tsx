/**
 * One tool call inside an expanded span: what ran, how big, how it went.
 * Clicking drills into the full input and output.
 */

import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { formatChars, formatSpanDuration } from '../../utils/transcript/formatters.js'
import { splitMcpToolName } from '../../utils/transcript/spanLabels.js'
import type { ToolCall } from '../../utils/transcript/spanTypes.js'
import { ToolCallDetail } from './ToolCallDetail.js'
import { STATUS_BADGES, iconForTool } from './spanStyles.js'

interface ToolCallRowProps {
  call: ToolCall
  index: number
  open: boolean
  highlighted: boolean
  onToggle: (callId: string) => void
}

const STATUS_LABEL = { ok: 'ok', error: 'error', pending: 'running' } as const

export function ToolCallRow({ call, index, open, highlighted, onToggle }: ToolCallRowProps) {
  const Icon = iconForTool(call.toolName)
  const { server, tool } = splitMcpToolName(call.toolName)
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon

  return (
    <>
      <button
        type="button"
        onClick={() => onToggle(call.id)}
        data-message-id={call.useMessage?.id ?? call.resultMessage?.id}
        aria-expanded={open}
        className={`grid w-full grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-2
          rounded px-1 py-1 text-left text-xs hover:bg-base-200
          ${highlighted ? 'bg-warning/20' : ''}`}
      >
        <span className="flex items-center gap-1 font-mono text-base-content/40 tabular-nums">
          <Chevron className="h-3 w-3" />
          {index + 1}
        </span>

        <span className="flex items-center gap-1 text-base-content/80">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">{tool}</span>
          {server && <span className="hidden text-base-content/40 sm:inline">{server}</span>}
        </span>

        <code className="truncate rounded bg-base-200 px-1.5 py-0.5 font-mono text-base-content/70">
          {call.label || <span className="italic opacity-60">no arguments</span>}
        </code>

        <span className="hidden whitespace-nowrap text-base-content/50 sm:inline">
          in {formatChars(call.inputChars)} · out {formatChars(call.outputChars)}
          {call.durationMs !== null && ` · ${formatSpanDuration(call.durationMs)}`}
        </span>

        <span className={`badge badge-xs ${STATUS_BADGES[call.status]}`}>
          {STATUS_LABEL[call.status]}
        </span>
      </button>

      {open && <ToolCallDetail call={call} />}
    </>
  )
}
