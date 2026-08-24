// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

// jsdom doesn't implement scrollIntoView (used by QuestionCard autoFocus)
window.HTMLElement.prototype.scrollIntoView = vi.fn()
import { AssessmentModal } from '../../src/ui/components/assessment/AssessmentModal'
import type { AssessmentQuestion } from '../../src/ui/components/assessment/types'

const QUESTIONS: AssessmentQuestion[] = [
  {
    id: 'q1_choice',
    text: 'First question (choice)',
    type: 'choice',
    category: 'feedback',
    required: true,
    choices: [
      { id: 'a', text: 'Option A' },
      { id: 'b', text: 'Option B' },
    ],
  },
  {
    id: 'q2_text',
    text: 'Second question (free text)',
    type: 'text',
    category: 'feedback',
    required: false,
  },
  {
    id: 'q3_choice',
    text: 'Third question (choice)',
    type: 'choice',
    category: 'feedback',
    required: true,
    choices: [
      { id: 'a', text: 'Option A' },
      { id: 'b', text: 'Option B' },
    ],
  },
]

/**
 * Complete the slide phase machine the way a real browser does: the sliding
 * container transitions `transform` and `opacity`, so transitionend fires
 * once per property — and child transitions (e.g. textarea focus styles)
 * bubble up to the same handler.
 */
function fireTransitionEnd(container: HTMLElement, times = 2) {
  const slider = container.querySelector('[style*="transform"]')
  expect(slider).not.toBeNull()
  for (let i = 0; i < times; i++) {
    fireEvent.transitionEnd(slider as Element)
  }
}

async function renderPreview() {
  const onClose = vi.fn()
  const utils = render(
    <AssessmentModal
      isOpen={true}
      onClose={onClose}
      onSubmit={vi.fn(async () => {})}
      questions={QUESTIONS}
      title="Preview"
      showVersionSelector={false}
      previewMode={true}
    />
  )
  await screen.findByText('First question (choice)')
  return { ...utils, onClose }
}

/** Wait for the slide phase machine to be idle (the primary nav button is enabled iff idle in preview). */
async function waitForIdle(container: HTMLElement) {
  await waitFor(() => {
    const navButton = container.querySelector<HTMLButtonElement>('.btn-primary')
    expect(navButton).not.toBeNull()
    expect(navButton?.disabled).toBe(false)
  })
}

async function pressArrowRight(container: HTMLElement, transitionEndCount = 2) {
  await waitForIdle(container)
  fireEvent.keyDown(window, { key: 'ArrowRight' })
  fireTransitionEnd(container, transitionEndCount)
  await waitForIdle(container)
}

describe('AssessmentModal preview keyboard navigation', () => {
  it('shows the free-text question after one ArrowRight from the first question', async () => {
    const { container } = await renderPreview()

    await pressArrowRight(container)

    // The text question must be visible — not skipped
    await waitFor(() => {
      expect(screen.queryByText('Second question (free text)')).not.toBeNull()
      expect(screen.queryByText('Third question (choice)')).toBeNull()
    })
  })

  it('visits every question exactly once when stepping through with ArrowRight', async () => {
    const { container } = await renderPreview()
    const seen: string[] = []
    const currentQuestionText = () =>
      QUESTIONS.find(q => screen.queryByText(q.text) !== null)?.id ?? 'none'

    seen.push(currentQuestionText())
    for (let i = 0; i < QUESTIONS.length - 1; i++) {
      await pressArrowRight(container)
      await waitFor(() => {
        const id = currentQuestionText()
        expect(id).not.toBe(seen[seen.length - 1])
      })
      seen.push(currentQuestionText())
    }

    expect(seen).toEqual(['q1_choice', 'q2_text', 'q3_choice'])
  })

  it('does not treat arrow keys as an "a" answer on choice questions (ghost auto-advance)', async () => {
    const { container } = await renderPreview()

    // On the first (choice) question, ArrowRight must navigate only — not
    // select choice "a" and schedule QuestionCard's 300ms auto-advance.
    await pressArrowRight(container)
    await waitFor(() => {
      expect(screen.queryByText('Second question (free text)')).not.toBeNull()
    })

    // If the ghost selection happened, the pending auto-advance fires ~300ms
    // later and pushes past the text question.
    await new Promise(resolve => setTimeout(resolve, 400))
    fireTransitionEnd(container)
    expect(screen.queryByText('Second question (free text)')).not.toBeNull()
    expect(screen.queryByText('Third question (choice)')).toBeNull()
  })

  it('typing on a text question focuses the field and keeps the first character', async () => {
    const user = userEvent.setup()
    const { container } = await renderPreview()
    await pressArrowRight(container) // now on the free-text question

    await user.keyboard('hi')

    const textarea = container.querySelector('textarea')
    expect(textarea).not.toBeNull()
    expect(document.activeElement).toBe(textarea)
    expect(textarea?.value).toBe('hi')
    // typing letters must not have navigated
    expect(screen.queryByText('Second question (free text)')).not.toBeNull()
  })

  it('Shift+Enter inserts a newline; plain Enter advances to the next question', async () => {
    const user = userEvent.setup()
    const { container } = await renderPreview()
    await pressArrowRight(container)

    await user.keyboard('line one{Shift>}{Enter}{/Shift}line two')
    expect(container.querySelector('textarea')?.value).toBe('line one\nline two')
    expect(screen.queryByText('Third question (choice)')).toBeNull()

    await user.keyboard('{Enter}')
    fireTransitionEnd(container)
    await waitFor(() => {
      expect(screen.queryByText('Third question (choice)')).not.toBeNull()
    })
  })

  it('Escape while typing leaves the field without closing the modal', async () => {
    const user = userEvent.setup()
    const { container, onClose } = await renderPreview()
    await pressArrowRight(container)

    await user.keyboard('draft answer{Escape}')

    expect(onClose).not.toHaveBeenCalled()
    expect(document.activeElement).not.toBe(container.querySelector('textarea'))
    expect(container.querySelector('textarea')?.value).toBe('draft answer')

    // ...and Escape outside the field still closes
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('letter shortcuts still answer choice questions', async () => {
    const { container } = await renderPreview()

    fireEvent.keyDown(window, { key: 'b' })
    // shortcut selects choice B and auto-advances after ~300ms
    await new Promise(resolve => setTimeout(resolve, 350))
    fireTransitionEnd(container)
    await waitFor(() => {
      expect(screen.queryByText('Second question (free text)')).not.toBeNull()
    })
  })

  it('key repeat while the slide animation is mid-flight does not skip a question', async () => {
    const { container } = await renderPreview()

    // Holding the key: repeats fire while phase is not idle...
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireTransitionEnd(container)
    // ...and one more repeat lands right after the phase machine settles
    await waitFor(() => {
      expect(screen.queryByText('Second question (free text)')).not.toBeNull()
    })

    expect(screen.queryByText('Third question (choice)')).toBeNull()
  })
})
