import { describe, it, expect } from 'vitest'
import { CanonicalSessionProcessor } from '../../../src/processors/canonical/index.js'
import { CanonicalParser } from '../../../src/parsers/index.js'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('CanonicalSessionProcessor', () => {
  const processor = new CanonicalSessionProcessor()
  const parser = new CanonicalParser()

  // Load real session fixtures
  const fixturesPath = join(__dirname, '../../fixtures/sessions')
  const SAMPLE_SESSION_1 = readFileSync(join(fixturesPath, 'claude-code-sample-1.jsonl'), 'utf-8')
  const SAMPLE_SESSION_2 = readFileSync(join(fixturesPath, 'claude-code-sample-2.jsonl'), 'utf-8')
  const SESSION_WITH_SUMMARY = readFileSync(join(fixturesPath, 'claude-code-with-summary.jsonl'), 'utf-8')

  describe('canProcess', () => {
    it('should detect valid canonical format (Claude Code)', () => {
      expect(processor.canProcess(SAMPLE_SESSION_1)).toBe(true)
    })

    it('should reject invalid format', () => {
      expect(processor.canProcess('not json')).toBe(false)
      expect(processor.canProcess('')).toBe(false)
    })
  })

  describe('parseSession', () => {
    it('should parse valid canonical session with real data', () => {
      const session = processor.parseSession(SAMPLE_SESSION_1, 'claude-code')

      expect(session).toBeDefined()
      expect(session.sessionId).toBeDefined()
      expect(session.provider).toBe('canonical')
      expect(session.messages).toBeDefined()
      expect(session.messages.length).toBeGreaterThan(0)
    })

    it('should extract session metadata', () => {
      const session = processor.parseSession(SAMPLE_SESSION_1, 'claude-code')

      expect(session.startTime).toBeInstanceOf(Date)
      expect(session.endTime).toBeInstanceOf(Date)
      expect(session.duration).toBeGreaterThanOrEqual(0)
    })

    it('should parse user and assistant messages', () => {
      const session = processor.parseSession(SAMPLE_SESSION_1, 'claude-code')

      const userMessages = session.messages.filter(m => m.type === 'user')
      const assistantMessages = session.messages.filter(m => m.type === 'assistant')

      expect(userMessages.length).toBeGreaterThan(0)
      expect(assistantMessages.length).toBeGreaterThan(0)
    })

    it('should parse structured content with tool uses', () => {
      const session = processor.parseSession(SAMPLE_SESSION_1, 'claude-code')

      // Find a message with structured content (canonical format uses singular toolUse)
      const structuredMessages = session.messages.filter(m =>
        typeof m.content === 'object' && 'toolUse' in m.content
      )

      expect(structuredMessages.length).toBeGreaterThan(0)

      if (structuredMessages.length > 0) {
        const firstStructured = structuredMessages[0]
        if (typeof firstStructured.content === 'object' && 'toolUse' in firstStructured.content) {
          expect(firstStructured.content.toolUse).toBeDefined()
        }
      }
    })

    it('should parse structured content with tool results', () => {
      const session = processor.parseSession(SAMPLE_SESSION_1, 'claude-code')

      // Find a message with tool results (canonical format uses singular toolResult)
      const messagesWithResults = session.messages.filter(m =>
        typeof m.content === 'object' && 'toolResult' in m.content
      )

      expect(messagesWithResults.length).toBeGreaterThan(0)
    })

    it('should handle smaller session file', () => {
      if (SAMPLE_SESSION_2.trim().length === 0) {
        return // Skip if file is empty
      }

      const canProcess = processor.canProcess(SAMPLE_SESSION_2)

      if (canProcess) {
        const session = processor.parseSession(SAMPLE_SESSION_2, 'claude-code')
        expect(session.messages.length).toBeGreaterThan(0)
        expect(session.duration).toBeGreaterThanOrEqual(0)
      }
    })

    it('should handle files with summary lines without timestamps', () => {
      expect(processor.canProcess(SESSION_WITH_SUMMARY)).toBe(true)

      const session = processor.parseSession(SESSION_WITH_SUMMARY, 'claude-code')

      expect(session).toBeDefined()
      expect(session.sessionId).toBe('test-session-123')
      expect(session.provider).toBe('canonical')
      expect(session.messages).toBeDefined()
      expect(session.messages.length).toBe(2) // Should skip summary lines and only parse 2 actual messages
      expect(session.startTime).toBeInstanceOf(Date)
      expect(session.endTime).toBeInstanceOf(Date)
      expect(session.duration).toBeGreaterThanOrEqual(0)
    })
  })

  describe('getMetricProcessors', () => {
    it('should return all 7 metric processors', () => {
      const metricProcessors = processor.getMetricProcessors()

      expect(metricProcessors.length).toBe(7)

      const metricTypes = metricProcessors.map(p => p.metricType)
      expect(metricTypes).toContain('performance')
      expect(metricTypes).toContain('engagement')
      expect(metricTypes).toContain('quality')
      expect(metricTypes).toContain('usage')
      expect(metricTypes).toContain('error')
      expect(metricTypes).toContain('context-management')
      expect(metricTypes).toContain('token-cost')
    })

    it('should run all metric processors', async () => {
      const session = processor.parseSession(SAMPLE_SESSION_1, 'claude-code')
      const metricProcessors = processor.getMetricProcessors()

      expect(metricProcessors.length).toBeGreaterThan(0)

      // Test each processor
      for (const metricProcessor of metricProcessors) {
        const metrics = await metricProcessor.process(session)
        expect(metrics).toBeDefined()
      }
    })
  })

  describe('processMetrics', () => {
    const context = {
      sessionId: 'test-session-123',
      tenantId: 'test-tenant-456',
      userId: 'test-user-789',
      provider: 'claude-code' as const
    }

    it('should process all metrics successfully', async () => {
      const results = await processor.processMetrics(SAMPLE_SESSION_1, context)

      expect(results.length).toBeGreaterThan(0)

      const metricTypes = results.map(r => r.metricType)
      expect(metricTypes).toContain('performance')
      expect(metricTypes).toContain('engagement')
      expect(metricTypes).toContain('quality')
      expect(metricTypes).toContain('usage')
    })

    it('should process full metrics pipeline', async () => {
      const results = await processor.processMetrics(SAMPLE_SESSION_1, context)

      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBeGreaterThan(0)

      for (const result of results) {
        expect(result.metricType).toBeDefined()
        expect(result.metrics).toBeDefined()
      }
    })

    it('should calculate performance metrics', async () => {
      const results = await processor.processMetrics(SAMPLE_SESSION_1, context)
      const perfMetrics = results.find(r => r.metricType === 'performance')

      expect(perfMetrics).toBeDefined()
      expect(perfMetrics?.metrics).toHaveProperty('response_latency_ms')
      expect(perfMetrics?.metrics).toHaveProperty('task_completion_time_ms')
    })

    it('should calculate engagement metrics', async () => {
      const results = await processor.processMetrics(SAMPLE_SESSION_1, context)
      const engagementMetrics = results.find(r => r.metricType === 'engagement')

      expect(engagementMetrics).toBeDefined()
      expect(engagementMetrics?.metrics).toHaveProperty('interruption_rate')
      expect(engagementMetrics?.metrics).toHaveProperty('session_length_minutes')
    })

    it('should calculate quality metrics', async () => {
      const results = await processor.processMetrics(SAMPLE_SESSION_1, context)
      const qualityMetrics = results.find(r => r.metricType === 'quality')

      expect(qualityMetrics).toBeDefined()
      expect(qualityMetrics?.metrics).toHaveProperty('task_success_rate')
      expect(qualityMetrics?.metrics).toHaveProperty('iteration_count')
      expect(qualityMetrics?.metrics).toHaveProperty('process_quality_score')
    })

    it('should calculate usage metrics', async () => {
      const results = await processor.processMetrics(SAMPLE_SESSION_1, context)
      const usageMetrics = results.find(r => r.metricType === 'usage')

      expect(usageMetrics).toBeDefined()
      expect(usageMetrics?.metrics).toHaveProperty('read_write_ratio')
      expect(usageMetrics?.metrics).toHaveProperty('input_clarity_score')
    })
  })

})
