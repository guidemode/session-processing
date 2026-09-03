/**
 * Full input and output for a single tool call, revealed by drilling into a row.
 */

import { formatChars, formatSpanDuration } from '../../utils/transcript/formatters.js'
import type { ToolCall } from '../../utils/transcript/spanTypes.js'
import { JsonBlock } from '../timeline/blocks/JsonBlock.js'
import { ToolResultBlock } from '../timeline/blocks/ToolResultBlock.js'

interface ToolCallDetailProps {
  call: ToolCall
}

/** `ToolResultBlock` takes a narrower type than the canonical `unknown` payload. */
type RenderableResult = string | Array<string | Record<string, unknown>> | Record<string, unknown>

function asRenderable(content: unknown): RenderableResult {
  if (typeof content === 'string' || Array.isArray(content)) return content as RenderableResult
  if (content && typeof content === 'object') return content as Record<string, unknown>
  return String(content ?? '')
}

export function ToolCallDetail({ call }: ToolCallDetailProps) {
  return (
    <div className="col-span-full mt-1 mb-2 ml-6 grid gap-2 border-l border-base-300 pl-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-base-content/60">
        <span className="font-mono">{call.toolName}</span>
        {call.subagentType && (
          <span className="badge badge-ghost badge-xs font-mono">{call.subagentType}</span>
        )}
        {call.isSidechain && <span className="badge badge-ghost badge-xs">sidechain</span>}
        <span>in {formatChars(call.inputChars)}</span>
        <span>out {formatChars(call.outputChars)}</span>
        {call.durationMs !== null && <span>{formatSpanDuration(call.durationMs)}</span>}
        {call.toolUseId && <span className="font-mono opacity-60">{call.toolUseId}</span>}
      </div>

      <div>
        <div className="mb-1 text-xs font-medium text-base-content/60">Input</div>
        {call.input ? (
          <JsonBlock content={call.input} collapsed={false} />
        ) : (
          <div className="text-xs italic text-base-content/40">
            No matching tool call was recorded for this result.
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 text-xs font-medium text-base-content/60">Output</div>
        {call.result ? (
          <ToolResultBlock
            content={asRenderable(call.result.content)}
            collapsed={false}
            toolName={call.toolName}
          />
        ) : (
          <div className="text-xs italic text-base-content/40">
            Still running — no result was recorded.
          </div>
        )}
      </div>
    </div>
  )
}
