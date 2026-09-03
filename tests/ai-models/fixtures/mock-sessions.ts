/**
 * Session fixtures for the AI model tasks.
 *
 * These now come from `canonical-fixtures.ts`, which builds each session by running
 * canonical JSONL through the real `CanonicalParser`. The previous hand-written literals
 * used a `toolUses: []` array shape the parser has never produced, so tests were green
 * against data that never reaches production.
 */

export {
  buildSession,
  EMPTY_SESSION,
  MOCK_CONTEXT,
  MOCK_PHASE_CONTEXT,
  MOCK_SESSION,
  MOCK_SESSION_WITH_PHASES,
  MOCK_USER,
} from './canonical-fixtures.js'
