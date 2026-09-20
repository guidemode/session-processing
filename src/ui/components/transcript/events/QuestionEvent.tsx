/**
 * A question put to the user, with the option they picked highlighted.
 *
 * Rendered as the multiple choice it was: every option carries a marker, and the chosen one is
 * ticked. Colour alone did the work before, which says "this one is different" without saying
 * that the others were offered and declined — and says nothing at all to a reader who cannot
 * separate the two greens.
 */

import { CheckCircleIcon } from '@heroicons/react/24/solid'
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
        <div key={entry.question} className="rounded border border-info/40 bg-info/10 p-2.5">
          <div className="flex flex-wrap items-baseline gap-2">
            {entry.header && <span className="badge badge-ghost badge-xs">{entry.header}</span>}
            <span className="text-sm font-medium">{entry.question}</span>
            {entry.multiSelect && (
              <span className="text-[11px] text-base-content/50">multi-select</span>
            )}
          </div>

          {/* One column, always. Options are a list to read down, and two columns put the
              third one under the first — so the reading order stopped matching the order the
              options were offered in. */}
          <div className="mt-2 grid gap-1.5">
            {entry.options.map(option => (
              <div
                key={option.label}
                className={`grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded border px-2.5 py-2 text-xs ${
                  option.chosen
                    ? 'border-success/50 bg-success/15 text-base-content'
                    : 'border-base-300 bg-base-100/60 text-base-content/70'
                }`}
              >
                {option.chosen ? (
                  <CheckCircleIcon className="mt-px h-4 w-4 shrink-0 text-success" />
                ) : (
                  // A ring rather than an icon: an empty marker should read as "not this one"
                  // without drawing the eye the way a second glyph would.
                  <span
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border border-base-content/25"
                    aria-hidden="true"
                  />
                )}
                <div>
                  <div className="font-medium">
                    {option.label}
                    {option.chosen && <span className="sr-only"> (chosen)</span>}
                  </div>
                  {option.description && (
                    <div className="mt-0.5 leading-relaxed text-base-content/60">
                      {option.description}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
