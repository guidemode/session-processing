import { describe, expect, it } from 'vitest'
import {
	redactCanonicalMessage,
	redactJsonlContent,
	redactText,
	replaceHomeDir,
} from '../../src/redaction/redactor.js'

describe('redactText', () => {
	it('returns original text when no secrets found', () => {
		const { text, counts } = redactText('Hello world, this is a normal string')
		expect(text).toBe('Hello world, this is a normal string')
		expect(Object.keys(counts)).toHaveLength(0)
	})

	it('returns empty text unchanged', () => {
		const { text, counts } = redactText('')
		expect(text).toBe('')
		expect(Object.keys(counts)).toHaveLength(0)
	})

	it('detects GitHub tokens (ghp_)', () => {
		const token = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234'
		const { text, counts } = redactText(`token: ${token}`)
		expect(text).not.toContain(token)
		expect(text).toContain('[REDACTED:')
		expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
	})

	it('detects Anthropic API keys', () => {
		const body =
			'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh'
		const key = `sk-ant-api03-${body}AA`
		const { text, counts } = redactText(`ANTHROPIC_API_KEY=${key}`)
		expect(text).not.toContain(key)
		expect(text).toContain('[REDACTED:')
		expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
	})

	it('detects private keys', () => {
		const keyContent =
			'-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn\n-----END RSA PRIVATE KEY-----'
		const { text, counts } = redactText(keyContent)
		expect(text).toContain('[REDACTED:')
		expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
	})

	it('detects database connection strings', () => {
		const { text, counts } = redactText(
			'DATABASE_URL=postgresql://user:password123@db.example.com:5432/mydb',
		)
		expect(text).toContain('[REDACTED:')
		expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
	})

	it('detects email addresses', () => {
		const { text, counts } = redactText(
			'Contact me at john.doe@company.com for details',
		)
		expect(text).not.toContain('john.doe@company.com')
		expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
	})

	it('detects home directory paths (/Users/)', () => {
		const { text, counts } = redactText(
			'Working in /Users/johndoe/projects/myapp',
		)
		expect(text).not.toContain('/Users/johndoe')
		expect(text).toContain('~')
		expect(counts.HOME_DIR).toBeGreaterThan(0)
	})

	it('detects home directory paths (/home/)', () => {
		const { text, counts } = redactText('Path: /home/developer/workspace')
		expect(text).not.toContain('/home/developer')
		expect(text).toContain('~')
		expect(counts.HOME_DIR).toBeGreaterThan(0)
	})

	it('detects GuideMode API keys (gai_)', () => {
		const key =
			'gai_07c7aa28646e6d832c28ec611c1062e2b6731904eb30de4db73135'
		const { text, counts } = redactText(`apiKey: ${key}`)
		expect(text).not.toContain(key)
		expect(text).toContain('[REDACTED:API_KEY]')
		expect(counts.API_KEY).toBeGreaterThan(0)
	})

	it('detects generic secret tokens after key= prefix', () => {
		const token = 'abcdef0123456789abcdef0123456789abcdef01'
		const { text, counts } = redactText(`api_key=${token}`)
		expect(text).not.toContain(token)
		expect(text).toContain('[REDACTED:')
		expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
	})

	it('detects AWS secret access keys', () => {
		const { text, counts } = redactText(
			'AWS_SECRET_ACCESS_KEY="abcdef1234567890abcdef1234567890abcDEFGH"',
		)
		expect(text).toContain('[REDACTED:')
		expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
	})

	it('does not false positive on normal code content', () => {
		const codeSnippets = [
			'import { loadConfig } from "./config.js"',
			'npm install -g guidemode',
			'const x = 42; function hello() { return "world"; }',
			'Command line interface for GuideMode app',
			'git commit -m "fix: update redaction logic"',
		]
		for (const snippet of codeSnippets) {
			const { text } = redactText(snippet)
			expect(text).toBe(snippet)
		}
	})

	it('handles multiple secrets in one string', () => {
		const ghToken = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234'
		const input = `GitHub: ${ghToken}, email: admin@secret-corp.com`
		const { text, counts } = redactText(input)
		expect(text).not.toContain(ghToken)
		expect(text).not.toContain('admin@secret-corp.com')
		expect(
			Object.values(counts).reduce((a, b) => a + b, 0),
		).toBeGreaterThanOrEqual(2)
	})
})

describe('redactCanonicalMessage', () => {
	it('returns malformed JSON unchanged', () => {
		const { line, counts } = redactCanonicalMessage('not valid json{')
		expect(line).toBe('not valid json{')
		expect(Object.keys(counts)).toHaveLength(0)
	})

	it('preserves structural metadata fields', () => {
		const input = JSON.stringify({
			uuid: 'abc-123',
			sessionId: 'sess-456',
			timestamp: '2024-01-01T00:00:00Z',
			type: 'message',
			provider: 'claude-code',
			version: '1.0',
			message: {
				role: 'assistant',
				model: 'claude-3',
				content: 'No secrets here',
				usage: { input_tokens: 100, output_tokens: 50 },
			},
		})
		const { line } = redactCanonicalMessage(input)
		const parsed = JSON.parse(line)
		expect(parsed.uuid).toBe('abc-123')
		expect(parsed.sessionId).toBe('sess-456')
		expect(parsed.type).toBe('message')
		expect(parsed.message.role).toBe('assistant')
		expect(parsed.message.usage.input_tokens).toBe(100)
	})

	it('redacts secrets in message.content string', () => {
		const ghToken = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234'
		const input = JSON.stringify({
			type: 'message',
			message: { role: 'user', content: `My token is ${ghToken}` },
		})
		const { line, counts } = redactCanonicalMessage(input)
		const parsed = JSON.parse(line)
		expect(parsed.message.content).not.toContain(ghToken)
		expect(parsed.message.content).toContain('[REDACTED:')
		expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
	})

	it('redacts secrets in content block text field', () => {
		const ghToken = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234'
		const input = JSON.stringify({
			type: 'message',
			message: {
				role: 'assistant',
				content: [{ type: 'text', text: `The token is ${ghToken}` }],
			},
		})
		const { line, counts } = redactCanonicalMessage(input)
		const parsed = JSON.parse(line)
		expect(parsed.message.content[0].text).not.toContain(ghToken)
		expect(parsed.message.content[0].text).toContain('[REDACTED:')
		expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
	})

	it('redacts secrets in thinking blocks', () => {
		const ghToken = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234'
		const input = JSON.stringify({
			type: 'message',
			message: {
				role: 'assistant',
				content: [
					{
						type: 'thinking',
						thinking: `I see the token ${ghToken} in the config`,
					},
				],
			},
		})
		const { line, counts } = redactCanonicalMessage(input)
		const parsed = JSON.parse(line)
		expect(parsed.message.content[0].thinking).not.toContain(ghToken)
		expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
	})

	it('redacts secrets in tool_result content', () => {
		const input = JSON.stringify({
			type: 'message',
			message: {
				role: 'tool',
				content: [
					{
						type: 'tool_result',
						tool_use_id: 'call-123',
						content:
							'DATABASE_URL=postgresql://admin:secret@db.example.com:5432/myapp',
					},
				],
			},
		})
		const { line, counts } = redactCanonicalMessage(input)
		const parsed = JSON.parse(line)
		expect(parsed.message.content[0].content).toContain('[REDACTED:')
		expect(parsed.message.content[0].tool_use_id).toBe('call-123')
		expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
	})

	it('redacts secrets in tool_use input values', () => {
		const ghToken = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234'
		const input = JSON.stringify({
			type: 'message',
			message: {
				role: 'assistant',
				content: [
					{
						type: 'tool_use',
						id: 'call-456',
						name: 'write_file',
						input: { path: '/tmp/config.env', content: `API_KEY=${ghToken}` },
					},
				],
			},
		})
		const { line, counts } = redactCanonicalMessage(input)
		const parsed = JSON.parse(line)
		expect(parsed.message.content[0].input.content).toContain('[REDACTED:')
		expect(parsed.message.content[0].id).toBe('call-456')
		expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
	})

	it('redacts cwd field when homeDir provided', () => {
		const input = JSON.stringify({
			type: 'message',
			cwd: '/Users/clifton/projects/myapp',
			message: { role: 'user', content: 'hello' },
		})
		const { line, counts } = redactCanonicalMessage(input, '/Users/clifton')
		const parsed = JSON.parse(line)
		expect(parsed.cwd).toBe('~/projects/myapp')
		expect(counts.HOME_DIR).toBeGreaterThan(0)
	})

	it('handles message without content gracefully', () => {
		const input = JSON.stringify({ type: 'system', version: '1.0' })
		const { line, counts } = redactCanonicalMessage(input)
		const parsed = JSON.parse(line)
		expect(parsed.type).toBe('system')
		expect(Object.keys(counts)).toHaveLength(0)
	})
})

describe('redactJsonlContent', () => {
	it('processes multi-line JSONL with stats', () => {
		const ghToken = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234'
		const lines = [
			JSON.stringify({
				type: 'message',
				message: { role: 'user', content: `My token ${ghToken}` },
			}),
			JSON.stringify({
				type: 'message',
				message: {
					role: 'assistant',
					content: 'I see you shared a token',
				},
			}),
			JSON.stringify({
				type: 'message',
				message: { role: 'user', content: 'email: test@secret.com' },
			}),
		].join('\n')

		const { content, stats } = redactJsonlContent(lines)
		const resultLines = content.split('\n')
		expect(resultLines).toHaveLength(3)

		for (const line of resultLines) {
			expect(() => JSON.parse(line)).not.toThrow()
		}

		expect(stats.linesProcessed).toBe(3)
		expect(stats.totalRedactions).toBeGreaterThan(0)
		expect(stats.linesWithRedactions).toBeGreaterThan(0)
	})

	it('handles empty lines', () => {
		const lines = [
			JSON.stringify({ type: 'system' }),
			'',
			JSON.stringify({
				type: 'message',
				message: { role: 'user', content: 'hello' },
			}),
		].join('\n')

		const { content, stats } = redactJsonlContent(lines)
		const resultLines = content.split('\n')
		expect(resultLines).toHaveLength(3)
		expect(resultLines[1]).toBe('')
		expect(stats.linesProcessed).toBe(2)
	})

	it('passes through malformed lines with counter', () => {
		const lines = [
			JSON.stringify({
				type: 'message',
				message: { role: 'user', content: 'hello' },
			}),
			'this is not json {{{',
			JSON.stringify({
				type: 'message',
				message: { role: 'assistant', content: 'hi' },
			}),
		].join('\n')

		const { content, stats } = redactJsonlContent(lines)
		const resultLines = content.split('\n')
		expect(resultLines[1]).toBe('this is not json {{{')
		expect(stats.malformedLines).toBe(1)
		expect(stats.linesProcessed).toBe(3)
	})

	it('handles empty content', () => {
		const { content, stats } = redactJsonlContent('')
		expect(content).toBe('')
		expect(stats.linesProcessed).toBe(0)
		expect(stats.totalRedactions).toBe(0)
	})
})

describe('replaceHomeDir', () => {
	it('replaces the given home directory with ~', () => {
		const result = replaceHomeDir(
			'/Users/clifton/projects/myapp',
			'/Users/clifton',
		)
		expect(result).toBe('~/projects/myapp')
	})

	it('returns text unchanged when no home dir present', () => {
		const result = replaceHomeDir(
			'/tmp/somefile.txt',
			'/Users/clifton',
		)
		expect(result).toBe('/tmp/somefile.txt')
	})

	it('returns text unchanged when homeDir is empty', () => {
		const result = replaceHomeDir('/Users/clifton/foo', '')
		expect(result).toBe('/Users/clifton/foo')
	})
})

describe('redaction preserves provider summary records', () => {
  // The CLI redacts before uploading, so anything redaction mangles never reaches the
  // server. cost-state is valid JSON with no uuid/message, so it does NOT take the
  // malformed-line passthrough - it goes through the normal redaction path.
  const COST_STATE = JSON.stringify({
    type: 'cost-state',
    sessionId: 'sess-1',
    totalCostUSD: 11.97120275,
    totalAPIDuration: 708903,
    totalLinesAdded: 1733,
    modelUsage: {
      'claude-opus-5[1m]': {
        inputTokens: 824,
        outputTokens: 42225,
        cacheReadInputTokens: 12069605,
        cacheCreationInputTokens: 139372,
        costUSD: 9.77191875,
      },
    },
    hasUnknownModelCost: false,
  })

  it('keeps the cost-state line parseable with its figures intact', () => {
    const input = `{"type":"assistant","uuid":"u1","message":{"role":"assistant"}}\n${COST_STATE}`
    const { content } = redactJsonlContent(input)

    const lines = content.split('\n').filter(l => l.trim())
    expect(lines).toHaveLength(2)

    const parsed = JSON.parse(lines[1])
    expect(parsed.type).toBe('cost-state')
    expect(parsed.totalCostUSD).toBe(11.97120275)
    expect(parsed.hasUnknownModelCost).toBe(false)
    // The context-tier suffix must survive verbatim - it changes the rate.
    expect(parsed.modelUsage['claude-opus-5[1m]'].costUSD).toBe(9.77191875)
    expect(parsed.modelUsage['claude-opus-5[1m]'].cacheReadInputTokens).toBe(12069605)
  })
})
