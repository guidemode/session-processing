/**
 * A question put to the user, with the option they picked highlighted.
 */

import type { QuestionPayload } from '../../../utils/transcript/spanTypes.js'

interface QuestionEventProps {
  payload: QuestionPayload
}

export function QuestionEvent({ payload }: QuestionEventProps) {
  if (payload.questions.length === 0) {
    return (
      <div className="mt-1 text-sm italic text-base-content/50">
        No question details were recorded.
      </div>
    )
  }

  return (
    <div className="mt-1 grid gap-2">
      {payload.questions.map(entry => (
        <div key={entry.question} className="rounded border border-info/40 bg-info/10 px-2 py-1.5">
          <div className="flex flex-wrap items-baseline gap-2">
            {entry.header && <span className="badge badge-ghost badge-xs">{entry.header}</span>}
            <span className="text-sm font-medium">{entry.question}</span>
            {entry.multiSelect && (
              <span className="text-[11px] text-base-content/50">multi-select</span>
            )}
          </div>

          <div className="mt-1 grid gap-1 sm:grid-cols-2">
            {entry.options.map(option => (
              <div
                key={option.label}
                className={`rounded px-1.5 py-1 text-xs ${
                  option.chosen ? 'bg-success/20 text-base-content' : 'bg-base-200'
                }`}
              >
                <div className="font-medium">{option.label}</div>
                {option.description && (
                  <div className="text-base-content/60">{option.description}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
