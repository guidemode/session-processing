/**
 * Session fixtures built by running canonical JSONL through the REAL parser.
 *
 * Hand-written `ParsedSession` literals drift from what production actually produces -
 * the previous fixtures used a `toolUses: []` array that the canonical parser has never
 * emitted, so tests exercised a shape no session ever has. Building fixtures from
 * canonical JSONL means a parser change that would break the AI tasks breaks these tests
 * too.
 */

import type { ParsedSession } from '@guidemode/types'
import { CanonicalParser } from '../../../src/parsers/canonical/parser.js'

interface CanonicalLine {
  uuid: string
  timestamp: string
  type: 'user' | 'assistant' | 'meta'
  sessionId: string
  provider: string
  message: { role: string; content: unknown }
  providerMetadata?: Record<string, unknown>
  isMeta?: boolean
}

let uuidCounter = 0
function nextUuid(): string {
  uuidCounter += 1
  return `uuid-${String(uuidCounter).padStart(4, '0')}`
}

const BASE_TIME = Date.parse('2025-01-01T00:00:00Z')

function line(
  sessionId: string,
  type: CanonicalLine['type'],
  content: unknown,
  offsetSeconds: number
): CanonicalLine {
  return {
    uuid: nextUuid(),
    timestamp: new Date(BASE_TIME + offsetSeconds * 1000).toISOString(),
    type,
    sessionId,
    provider: 'claude-code',
    message: { role: type === 'meta' ? 'assistant' : type, content },
  }
}

/** Build a `ParsedSession` by parsing canonical JSONL, exactly as production does. */
export function buildSession(sessionId: string, lines: CanonicalLine[]): ParsedSession {
  const jsonl = lines.map(l => JSON.stringify(l)).join('\n')
  return new CanonicalParser().parseSession(jsonl, 'claude-code') as unknown as ParsedSession
}

const text = (value: string) => [{ type: 'text', text: value }]
const toolUse = (id: string, name: string, input: Record<string, unknown>) => [
  { type: 'tool_use', id, name, input },
]
const toolResult = (id: string, content: unknown, isError = false) => [
  { type: 'tool_result', tool_use_id: id, content, is_error: isError },
]

/**
 * A short, well-behaved session: two user turns, assistant prose, a write and an edit.
 */
export const MOCK_SESSION: ParsedSession = buildSession('test-session-123', [
  line('test-session-123', 'user', 'Can you help me create a user authentication system?', 0),
  line(
    'test-session-123',
    'assistant',
    text("I'll help you create a user authentication system. Let me start by creating the necessary files."),
    5
  ),
  line(
    'test-session-123',
    'assistant',
    toolUse('tool-1', 'Write', { filePath: '/auth/user.ts', content: 'export class User {}' }),
    6
  ),
  line('test-session-123', 'user', toolResult('tool-1', 'File written'), 7),
  line('test-session-123', 'user', 'Great! Can you add password hashing?', 120),
  line('test-session-123', 'assistant', text('I will add password hashing functionality.'), 125),
  line(
    'test-session-123',
    'assistant',
    toolUse('tool-2', 'Edit', { filePath: '/auth/user.ts', content: 'Updated with bcrypt' }),
    126
  ),
  line('test-session-123', 'user', toolResult('tool-2', 'File edited'), 127),
  line('test-session-123', 'user', 'Perfect, thank you!', 600),
])

/**
 * A longer session that moves through recognisable phases, including a plan presented via
 * `ExitPlanMode`, a todo list, an interruption, a slash command and a failing tool call.
 */
export const MOCK_SESSION_WITH_PHASES: ParsedSession = buildSession('test-session-456', [
  line(
    'test-session-456',
    'user',
    'I need to build a REST API for managing blog posts with CRUD operations.',
    0
  ),
  line('test-session-456', 'user', '/plan', 5),
  line(
    'test-session-456',
    'assistant',
    text('Let me analyze the requirements and create a plan for the REST API.'),
    10
  ),
  line(
    'test-session-456',
    'assistant',
    toolUse('plan-1', 'ExitPlanMode', {
      plan: '1. Define the Post model\n2. Add CRUD routes\n3. Wire up validation\n4. Add tests',
    }),
    15
  ),
  line('test-session-456', 'user', toolResult('plan-1', 'User approved the plan'), 20),
  line(
    'test-session-456',
    'assistant',
    toolUse('todo-1', 'TodoWrite', {
      todos: [
        { content: 'Define the Post model', status: 'in_progress', activeForm: 'Defining' },
        { content: 'Add CRUD routes', status: 'pending', activeForm: 'Adding' },
      ],
    }),
    25
  ),
  line('test-session-456', 'user', toolResult('todo-1', 'Todos updated'), 26),
  line('test-session-456', 'assistant', text('Creating the Post model now.'), 30),
  line(
    'test-session-456',
    'assistant',
    toolUse('tool-3', 'Write', { filePath: '/models/post.ts', content: 'export class Post {}' }),
    35
  ),
  line('test-session-456', 'user', toolResult('tool-3', 'File written'), 36),
  line(
    'test-session-456',
    'assistant',
    toolUse('tool-4', 'Bash', { command: 'npm test' }),
    40
  ),
  line('test-session-456', 'user', toolResult('tool-4', 'Tests failed: 2 failing', true), 45),
  line('test-session-456', 'user', '[Request interrupted by user]', 50),
  line('test-session-456', 'user', 'Wait, use Zod for validation instead of manual checks.', 55),
  line('test-session-456', 'assistant', text('Understood, switching to Zod for validation.'), 60),
  line(
    'test-session-456',
    'assistant',
    toolUse('tool-5', 'Edit', { filePath: '/models/post.ts', content: 'zod schema' }),
    65
  ),
  line('test-session-456', 'user', toolResult('tool-5', 'File edited'), 66),
  line(
    'test-session-456',
    'assistant',
    text('The REST API is complete with Zod validation and all tests passing.'),
    600
  ),
  line('test-session-456', 'user', 'Looks good, thanks!', 620),
])

/**
 * A session with no messages at all.
 *
 * Built as a literal rather than parsed: the parser rejects empty content outright
 * (`BaseParser.validateContent`), so this shape can only arise downstream.
 */
export const EMPTY_SESSION: ParsedSession = {
  sessionId: 'empty-session',
  provider: 'claude-code',
  startTime: new Date('2025-01-01T00:00:00Z'),
  endTime: new Date('2025-01-01T00:00:01Z'),
  duration: 1000,
  messages: [],
  metadata: { messageCount: 0, lineCount: 0 },
}

export const MOCK_USER = {
  id: 'user-123',
  username: 'testuser',
  email: 'test@example.com',
}

export const MOCK_CONTEXT = {
  sessionId: 'test-session-123',
  tenantId: 'test-tenant',
  userId: 'user-123',
  provider: 'claude-code',
  session: MOCK_SESSION,
  user: MOCK_USER,
}

export const MOCK_PHASE_CONTEXT = {
  sessionId: 'test-session-456',
  tenantId: 'test-tenant',
  userId: 'user-123',
  provider: 'claude-code',
  session: MOCK_SESSION_WITH_PHASES,
  user: MOCK_USER,
}
