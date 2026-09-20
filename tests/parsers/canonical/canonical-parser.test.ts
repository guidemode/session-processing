/**
 * CanonicalParser Tests
 *
 * Tests for the unified canonical parser that handles all providers
 */

import { describe, expect, it } from 'vitest'
import { CanonicalParser } from '../../../src/parsers/canonical/parser.js'

describe('CanonicalParser', () => {
  const parser = new CanonicalParser()

  describe('canParse', () => {
    it('should detect canonical format with user message', () => {
      const canonicalJsonl = `{"uuid":"123","sessionId":"session-1","type":"user","message":{"role":"user","content":"Hello"},"timestamp":"2025-10-01T00:00:00Z","provider":"claude-code"}`

      expect(parser.canParse(canonicalJsonl)).toBe(true)
    })

    it('should detect canonical format with assistant message', () => {
      const canonicalJsonl = `{"uuid":"456","sessionId":"session-1","type":"assistant","message":{"role":"assistant","content":"Hi there"},"timestamp":"2025-10-01T00:00:01Z","provider":"gemini-code"}`

      expect(parser.canParse(canonicalJsonl)).toBe(true)
    })

    it('should detect canonical format with meta message', () => {
      const canonicalJsonl = `{"uuid":"789","sessionId":"session-1","type":"meta","message":{"role":"system","content":"Session started"},"timestamp":"2025-10-01T00:00:00Z","provider":"codex"}`

      expect(parser.canParse(canonicalJsonl)).toBe(true)
    })

    it('should reject non-canonical format', () => {
      const nonCanonical = `{"id":"123","content":"Hello"}`

      expect(parser.canParse(nonCanonical)).toBe(false)
    })

    it('should reject empty content', () => {
      expect(parser.canParse('')).toBe(false)
    })

    it('should reject invalid JSON', () => {
      expect(parser.canParse('not json')).toBe(false)
    })
  })

  describe('parseMessage', () => {
    it('should parse text message', () => {
      const rawMessage = {
        uuid: 'msg-1',
        timestamp: '2025-10-01T00:00:00Z',
        type: 'user',
        sessionId: 'session-1',
        provider: 'claude-code',
        cwd: '/test',
        gitBranch: 'main',
        message: {
          role: 'user',
          content: 'Hello, world!',
        },
      }

      const result = parser.parseMessage(rawMessage)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        id: 'msg-1',
        type: 'user',
        content: 'Hello, world!',
        metadata: {
          role: 'user',
          sessionId: 'session-1',
          provider: 'claude-code',
          cwd: '/test',
          gitBranch: 'main',
        },
      })
    })

    it('should parse assistant message with model and usage', () => {
      const rawMessage = {
        uuid: 'msg-2',
        timestamp: '2025-10-01T00:00:01Z',
        type: 'assistant',
        sessionId: 'session-1',
        provider: 'gemini-code',
        message: {
          role: 'assistant',
          content: 'Hello!',
          model: 'claude-sonnet-4.5',
          usage: {
            input_tokens: 100,
            output_tokens: 50,
          },
        },
      }

      const result = parser.parseMessage(rawMessage)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        id: 'msg-2',
        type: 'assistant',
        content: 'Hello!',
        metadata: {
          model: 'claude-sonnet-4.5',
          usage: {
            input_tokens: 100,
            output_tokens: 50,
          },
        },
      })
    })

    it('should parse message with single text block', () => {
      const rawMessage = {
        uuid: 'msg-3',
        timestamp: '2025-10-01T00:00:02Z',
        type: 'assistant',
        sessionId: 'session-1',
        provider: 'claude-code',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Let me help with that.' }],
        },
      }

      const result = parser.parseMessage(rawMessage)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('assistant')
      expect(result[0].id).toBe('msg-3')
      expect(result[0].content).toMatchObject({
        type: 'structured',
        text: 'Let me help with that.',
      })
    })

    it('should parse message with single tool_use block', () => {
      const rawMessage = {
        uuid: 'msg-3-tool',
        timestamp: '2025-10-01T00:00:03Z',
        type: 'assistant',
        sessionId: 'session-1',
        provider: 'claude-code',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: '/test.ts' } },
          ],
        },
      }

      const result = parser.parseMessage(rawMessage)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('tool_use')
      expect(result[0].id).toBe('msg-3-tool')
      expect(result[0].content).toMatchObject({
        type: 'structured',
        toolUse: {
          type: 'tool_use',
          id: 'tool-1',
          name: 'Read',
          input: { file_path: '/test.ts' },
        },
      })
    })

    it('should parse message with tool_result block', () => {
      const rawMessage = {
        uuid: 'msg-4',
        timestamp: '2025-10-01T00:00:03Z',
        type: 'user',
        sessionId: 'session-1',
        provider: 'claude-code',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-1',
              content: 'File content here',
              is_error: false,
            },
          ],
        },
      }

      const result = parser.parseMessage(rawMessage)

      expect(result).toHaveLength(1)
      // Should have type 'tool_result', not 'user'
      expect(result[0].type).toBe('tool_result')
      // Canonical format preserves original ID
      expect(result[0].id).toBe('msg-4')
      expect(result[0].linkedTo).toBe('tool-1')
      // Uses singular toolResult property
      expect(result[0].content).toMatchObject({
        type: 'structured',
        toolResult: {
          type: 'tool_result',
          tool_use_id: 'tool-1',
          content: 'File content here',
          is_error: false,
        },
      })
    })

    it('should parse error tool_result block', () => {
      const rawMessage = {
        uuid: 'msg-error',
        timestamp: '2025-10-01T00:00:04Z',
        type: 'user',
        sessionId: 'session-1',
        provider: 'claude-code',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-2',
              content: 'Error: File not found',
              is_error: true,
            },
          ],
        },
      }

      const result = parser.parseMessage(rawMessage)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('tool_result')
      expect(result[0].content).toMatchObject({
        type: 'structured',
        toolResult: {
          type: 'tool_result',
          tool_use_id: 'tool-2',
          content: 'Error: File not found',
          is_error: true,
        },
      })
    })

    it('should parse tool_use with complex nested input', () => {
      const rawMessage = {
        uuid: 'msg-complex',
        timestamp: '2025-10-01T00:00:05Z',
        type: 'assistant',
        sessionId: 'session-1',
        provider: 'claude-code',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-complex',
              name: 'Grep',
              input: {
                pattern: 'function.*test',
                path: '/src',
                glob: '**/*.ts',
                options: { recursive: true, ignoreCase: false },
              },
            },
          ],
        },
      }

      const result = parser.parseMessage(rawMessage)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('tool_use')
      expect(result[0].content).toMatchObject({
        type: 'structured',
        toolUse: {
          type: 'tool_use',
          id: 'tool-complex',
          name: 'Grep',
          input: {
            pattern: 'function.*test',
            path: '/src',
            glob: '**/*.ts',
            options: { recursive: true, ignoreCase: false },
          },
        },
      })
    })

    it('should parse thinking block message', () => {
      const rawMessage = {
        uuid: 'msg-thinking',
        timestamp: '2025-10-01T00:00:06Z',
        type: 'assistant',
        sessionId: 'session-1',
        provider: 'claude-code',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'thinking',
              thinking: 'I need to analyze the user request and determine the best approach...',
            },
          ],
        },
      }

      const result = parser.parseMessage(rawMessage)

      expect(result).toHaveLength(1)
      // Thinking blocks have type 'assistant' with isThinking flag in metadata
      expect(result[0].type).toBe('assistant')
      expect(result[0].metadata.isThinking).toBe(true)
      expect(result[0].content).toMatchObject({
        type: 'structured',
        text: 'I need to analyze the user request and determine the best approach...',
      })
    })

    it('should parse Gemini extended thinking (multiple thinking blocks)', () => {
      // This is the exception to single-block rule - Gemini can have multiple thinking blocks
      // Each block becomes a separate message
      const rawMessage = {
        uuid: 'msg-gemini-thinking',
        timestamp: '2025-10-01T00:00:07Z',
        type: 'assistant',
        sessionId: 'session-1',
        provider: 'gemini-code',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'thinking',
              thinking: 'First, I need to understand the codebase structure...',
            },
            {
              type: 'thinking',
              thinking: 'Next, I should identify the relevant files...',
            },
            {
              type: 'thinking',
              thinking: 'Finally, I can formulate a plan...',
            },
          ],
        },
      }

      const result = parser.parseMessage(rawMessage)

      // Multiple thinking blocks create separate messages
      expect(result).toHaveLength(3)

      // Each message is type 'assistant' with isThinking flag
      expect(result[0].type).toBe('assistant')
      expect(result[0].metadata.isThinking).toBe(true)
      expect(result[0].id).toBe('msg-gemini-thinking-thinking-0')
      expect(result[0].content).toMatchObject({
        type: 'structured',
        text: 'First, I need to understand the codebase structure...',
      })

      expect(result[1].type).toBe('assistant')
      expect(result[1].metadata.isThinking).toBe(true)
      expect(result[1].id).toBe('msg-gemini-thinking-thinking-1')
      expect(result[1].content).toMatchObject({
        type: 'structured',
        text: 'Next, I should identify the relevant files...',
      })

      expect(result[2].type).toBe('assistant')
      expect(result[2].metadata.isThinking).toBe(true)
      expect(result[2].id).toBe('msg-gemini-thinking-thinking-2')
      expect(result[2].content).toMatchObject({
        type: 'structured',
        text: 'Finally, I can formulate a plan...',
      })
    })

    it('should preserve provider metadata', () => {
      const rawMessage = {
        uuid: 'msg-5',
        timestamp: '2025-10-01T00:00:04Z',
        type: 'assistant',
        sessionId: 'session-1',
        provider: 'gemini-code',
        message: {
          role: 'assistant',
          content: 'Response',
        },
        providerMetadata: {
          gemini_type: 'gemini',
          has_thoughts: true,
        },
      }

      const result = parser.parseMessage(rawMessage)

      expect(result[0].metadata.providerMetadata).toEqual({
        gemini_type: 'gemini',
        has_thoughts: true,
      })
    })

    it('should handle parent UUID', () => {
      const rawMessage = {
        uuid: 'msg-6',
        timestamp: '2025-10-01T00:00:05Z',
        type: 'user',
        sessionId: 'session-1',
        provider: 'claude-code',
        parentUuid: 'msg-5',
        message: {
          role: 'user',
          content: 'Follow-up',
        },
      }

      const result = parser.parseMessage(rawMessage)

      expect(result[0].parentId).toBe('msg-5')
    })

    it('should return empty array for invalid message', () => {
      const invalidMessage = {
        notACanonicalMessage: true,
      }

      const result = parser.parseMessage(invalidMessage)

      expect(result).toEqual([])
    })

    it('should return empty array for message with invalid timestamp', () => {
      const rawMessage = {
        uuid: 'msg-7',
        timestamp: 'invalid-timestamp',
        type: 'user',
        sessionId: 'session-1',
        provider: 'claude-code',
        message: {
          role: 'user',
          content: 'Test',
        },
      }

      const result = parser.parseMessage(rawMessage)

      expect(result).toEqual([])
    })
  })

  describe('parseSession', () => {
    it('should parse complete canonical session', () => {
      const jsonl = [
        '{"uuid":"msg-1","timestamp":"2025-10-01T00:00:00Z","type":"user","sessionId":"session-1","provider":"claude-code","message":{"role":"user","content":"Hello"}}',
        '{"uuid":"msg-2","timestamp":"2025-10-01T00:00:01Z","type":"assistant","sessionId":"session-1","provider":"claude-code","message":{"role":"assistant","content":"Hi","model":"claude-sonnet-4.5","usage":{"input_tokens":10,"output_tokens":5}}}',
        '{"uuid":"msg-3","timestamp":"2025-10-01T00:00:02Z","type":"user","sessionId":"session-1","provider":"claude-code","message":{"role":"user","content":"Thanks"}}',
      ].join('\n')

      const session = parser.parseSession(jsonl)

      expect(session.sessionId).toBe('session-1')
      expect(session.provider).toBe('canonical')
      expect(session.messages).toHaveLength(3)
      expect(session.messages[0].type).toBe('user')
      expect(session.messages[1].type).toBe('assistant')
      expect(session.messages[2].type).toBe('user')
    })

    it('should calculate session duration', () => {
      const jsonl = [
        '{"uuid":"msg-1","timestamp":"2025-10-01T00:00:00Z","type":"user","sessionId":"session-1","provider":"claude-code","message":{"role":"user","content":"Start"}}',
        '{"uuid":"msg-2","timestamp":"2025-10-01T00:05:00Z","type":"assistant","sessionId":"session-1","provider":"claude-code","message":{"role":"assistant","content":"End"}}',
      ].join('\n')

      const session = parser.parseSession(jsonl)

      expect(session.duration).toBe(5 * 60 * 1000) // 5 minutes in ms
    })

    it('should count messages and lines', () => {
      const jsonl = [
        '{"uuid":"msg-1","timestamp":"2025-10-01T00:00:00Z","type":"user","sessionId":"session-1","provider":"claude-code","message":{"role":"user","content":"One"}}',
        '{"uuid":"msg-2","timestamp":"2025-10-01T00:00:01Z","type":"assistant","sessionId":"session-1","provider":"claude-code","message":{"role":"assistant","content":"Two"}}',
      ].join('\n')

      const session = parser.parseSession(jsonl)

      expect(session.metadata.messageCount).toBe(2)
      expect(session.metadata.lineCount).toBe(2)
    })
  })

  describe('images', () => {
    // A pasted screenshot arrives as a second block beside text that says only
    // `[Image #12]`. It used to be dropped, leaving the placeholder pointing at
    // nothing.
    const imageLine = (text?: string) =>
      JSON.stringify({
        uuid: 'img-1',
        sessionId: 'session-1',
        type: 'user',
        provider: 'claude-code',
        timestamp: '2025-10-01T00:00:00Z',
        message: {
          role: 'user',
          content: [
            ...(text ? [{ type: 'text', text }] : []),
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' },
            },
          ],
        },
      })

    it('carries a pasted image alongside the text that refers to it', () => {
      const { messages } = parser.parseSession(imageLine('See [Image #12]'))

      expect(messages).toHaveLength(1)
      const content = messages[0].content as { text?: string; images?: unknown[] }
      expect(content.text).toBe('See [Image #12]')
      expect(content.images).toEqual([
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' },
        },
      ])
    })

    it('keeps an image that arrives with no text of its own', () => {
      const { messages } = parser.parseSession(imageLine())

      expect(messages).toHaveLength(1)
      expect((messages[0].content as { images?: unknown[] }).images).toHaveLength(1)
    })
  })

  describe('extractSessionId', () => {
    it('should extract sessionId from canonical message', () => {
      const rawMessage = {
        sessionId: 'test-session-id',
        uuid: 'msg-1',
        timestamp: '2025-10-01T00:00:00Z',
        type: 'user',
        provider: 'claude-code',
        message: { role: 'user', content: 'Test' },
      }

      const result = (parser as any).extractSessionId(rawMessage)

      expect(result).toBe('test-session-id')
    })
  })
})
