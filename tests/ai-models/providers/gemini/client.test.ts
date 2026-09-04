import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
	GeminiAPIClient,
	type GeminiClientConfig,
	type GeminiResponse,
} from '../../../../src/ai-models/providers/gemini/client.js'

describe('GeminiAPIClient', () => {
	let client: GeminiAPIClient
	let config: GeminiClientConfig
	let fetchMock: ReturnType<typeof vi.fn>

	beforeEach(() => {
		config = {
			apiKey: 'test-api-key-123',
			model: 'gemini-2.0-flash',
			maxOutputTokens: 4096,
			temperature: 0.7,
			timeout: 30000,
		}

		fetchMock = vi.fn()
		global.fetch = fetchMock
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe('Configuration', () => {
		it('should initialize with provided config', () => {
			client = new GeminiAPIClient(config)
			expect(client).toBeDefined()
		})

		it('should use default model if not provided', () => {
			const configWithoutModel = { ...config, model: undefined }
			client = new GeminiAPIClient(configWithoutModel)
			expect(client).toBeDefined()
		})

		it('should use default maxOutputTokens if not provided', () => {
			const configWithoutTokens = { ...config, maxOutputTokens: undefined }
			client = new GeminiAPIClient(configWithoutTokens)
			expect(client).toBeDefined()
		})

		it('should use default temperature if not provided', () => {
			const configWithoutTemp = { ...config, temperature: undefined }
			client = new GeminiAPIClient(configWithoutTemp)
			expect(client).toBeDefined()
		})

		it('should use default timeout if not provided', () => {
			const configWithoutTimeout = { ...config, timeout: undefined }
			client = new GeminiAPIClient(configWithoutTimeout)
			expect(client).toBeDefined()
		})

		it('should accept temperature of 0', () => {
			const configWithZeroTemp = { ...config, temperature: 0 }
			client = new GeminiAPIClient(configWithZeroTemp)
			expect(client).toBeDefined()
		})
	})

	describe('generateContent', () => {
		beforeEach(() => {
			client = new GeminiAPIClient(config)
		})

		it('should make successful API request', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: 'Hello! How can I help you?' }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 10,
					candidatesTokenCount: 20,
					totalTokenCount: 30,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			const messages = [
				{
					role: 'user' as const,
					parts: [{ text: 'Hello' }],
				},
			]

			const response = await client.generateContent(messages)

			expect(response).toEqual(mockResponse)
			expect(fetchMock).toHaveBeenCalledTimes(1)
			expect(fetchMock).toHaveBeenCalledWith(
				expect.stringContaining('gemini-2.0-flash:generateContent'),
				expect.objectContaining({
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: expect.any(String),
				})
			)
		})

		it('should include system instruction when provided', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: 'Response with instruction' }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 15,
					candidatesTokenCount: 25,
					totalTokenCount: 40,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			const messages = [
				{
					role: 'user' as const,
					parts: [{ text: 'Hello' }],
				},
			]

			await client.generateContent(messages, {
				systemInstruction: 'You are a helpful assistant',
			})

			const callArgs = fetchMock.mock.calls[0]
			const body = JSON.parse(callArgs[1].body)

			expect(body.systemInstruction).toEqual({
				parts: [{ text: 'You are a helpful assistant' }],
			})
		})

		it('should support custom temperature', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: 'Creative response' }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 10,
					candidatesTokenCount: 15,
					totalTokenCount: 25,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			const messages = [
				{
					role: 'user' as const,
					parts: [{ text: 'Tell me a story' }],
				},
			]

			await client.generateContent(messages, { temperature: 1.5 })

			const callArgs = fetchMock.mock.calls[0]
			const body = JSON.parse(callArgs[1].body)

			expect(body.generationConfig.temperature).toBe(1.5)
		})

		it('should support custom maxOutputTokens', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: 'Short response' }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 10,
					candidatesTokenCount: 5,
					totalTokenCount: 15,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			const messages = [
				{
					role: 'user' as const,
					parts: [{ text: 'Brief answer' }],
				},
			]

			await client.generateContent(messages, { maxOutputTokens: 100 })

			const callArgs = fetchMock.mock.calls[0]
			const body = JSON.parse(callArgs[1].body)

			expect(body.generationConfig.maxOutputTokens).toBe(100)
		})

		it('should support custom model', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: 'Response from custom model' }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 12,
					candidatesTokenCount: 18,
					totalTokenCount: 30,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			const messages = [
				{
					role: 'user' as const,
					parts: [{ text: 'Hello' }],
				},
			]

			await client.generateContent(messages, { model: 'gemini-1.5-pro' })

			expect(fetchMock).toHaveBeenCalledWith(
				expect.stringContaining('gemini-1.5-pro:generateContent'),
				expect.any(Object)
			)
		})

		it('should support responseMimeType option', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: '{"key": "value"}' }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 10,
					candidatesTokenCount: 8,
					totalTokenCount: 18,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			const messages = [
				{
					role: 'user' as const,
					parts: [{ text: 'Return JSON' }],
				},
			]

			await client.generateContent(messages, { responseMimeType: 'application/json' })

			const callArgs = fetchMock.mock.calls[0]
			const body = JSON.parse(callArgs[1].body)

			expect(body.generationConfig.responseMimeType).toBe('application/json')
		})

		it('should handle API errors with JSON error response', async () => {
			const errorResponse = {
				error: {
					message: 'Invalid API key',
					status: 'UNAUTHENTICATED',
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: false,
				status: 401,
				text: async () => JSON.stringify(errorResponse),
			})

			const messages = [
				{
					role: 'user' as const,
					parts: [{ text: 'Hello' }],
				},
			]

			await expect(client.generateContent(messages)).rejects.toThrow(
				'Gemini API error (401) Invalid API key'
			)
		})

		it('should handle API errors with text error response', async () => {
			fetchMock.mockResolvedValueOnce({
				ok: false,
				status: 500,
				text: async () => 'Internal server error',
			})

			const messages = [
				{
					role: 'user' as const,
					parts: [{ text: 'Hello' }],
				},
			]

			await expect(client.generateContent(messages)).rejects.toThrow(
				'AI provider internal error — please retry. Internal server error'
			)
		})

		it('should truncate very long error messages', async () => {
			const longError = 'A'.repeat(300)

			fetchMock.mockResolvedValueOnce({
				ok: false,
				status: 500,
				text: async () => longError,
			})

			const messages = [
				{
					role: 'user' as const,
					parts: [{ text: 'Hello' }],
				},
			]

			await expect(client.generateContent(messages)).rejects.toThrow(
				/AI provider internal error — please retry\..*\.\.\./
			)
		})

		it('should handle timeout errors', async () => {
			// Create a client with very short timeout
			const shortTimeoutClient = new GeminiAPIClient({ ...config, timeout: 1 })

			// Mock fetch to throw AbortError like the real abort controller does
			fetchMock.mockImplementationOnce(() => {
				const error = new Error('The operation was aborted')
				error.name = 'AbortError'
				return Promise.reject(error)
			})

			const messages = [
				{
					role: 'user' as const,
					parts: [{ text: 'Hello' }],
				},
			]

			await expect(shortTimeoutClient.generateContent(messages)).rejects.toThrow(
				/Request timeout after/
			)
		})

		it('should handle network errors', async () => {
			fetchMock.mockRejectedValueOnce(new Error('Network error'))

			const messages = [
				{
					role: 'user' as const,
					parts: [{ text: 'Hello' }],
				},
			]

			await expect(client.generateContent(messages)).rejects.toThrow('Network error')
		})

		it('should handle multiple message turns', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: 'Response to conversation' }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 50,
					candidatesTokenCount: 30,
					totalTokenCount: 80,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			const messages = [
				{
					role: 'user' as const,
					parts: [{ text: 'First message' }],
				},
				{
					role: 'model' as const,
					parts: [{ text: 'First response' }],
				},
				{
					role: 'user' as const,
					parts: [{ text: 'Second message' }],
				},
			]

			const response = await client.generateContent(messages)

			expect(response).toEqual(mockResponse)

			const callArgs = fetchMock.mock.calls[0]
			const body = JSON.parse(callArgs[1].body)

			expect(body.contents).toHaveLength(3)
		})
	})

	describe('prompt', () => {
		beforeEach(() => {
			client = new GeminiAPIClient(config)
		})

		it('should send prompt and return text response', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: 'Hello! How can I help you today?' }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 5,
					candidatesTokenCount: 12,
					totalTokenCount: 17,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			const result = await client.prompt('Hello')

			expect(result.text).toBe('Hello! How can I help you today?')
			expect(result.usage.input_tokens).toBe(5)
			expect(result.usage.output_tokens).toBe(12)
		})

		it('should combine multiple text parts', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: 'Part 1\n' }, { text: 'Part 2' }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 10,
					candidatesTokenCount: 15,
					totalTokenCount: 25,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			const result = await client.prompt('Test')

			expect(result.text).toBe('Part 1\n\nPart 2')
		})

		it('should handle empty response', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 5,
					candidatesTokenCount: 0,
					totalTokenCount: 5,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			const result = await client.prompt('Test')

			expect(result.text).toBe('')
			expect(result.usage.input_tokens).toBe(5)
			expect(result.usage.output_tokens).toBe(0)
		})

		it('should support custom options', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: 'Response with options' }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 20,
					candidatesTokenCount: 10,
					totalTokenCount: 30,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			await client.prompt('Test prompt', {
				model: 'gemini-1.5-pro',
				temperature: 0.5,
				maxOutputTokens: 500,
				systemInstruction: 'Be concise',
			})

			expect(fetchMock).toHaveBeenCalledWith(
				expect.stringContaining('gemini-1.5-pro'),
				expect.any(Object)
			)

			const callArgs = fetchMock.mock.calls[0]
			const body = JSON.parse(callArgs[1].body)

			expect(body.generationConfig.temperature).toBe(0.5)
			expect(body.generationConfig.maxOutputTokens).toBe(500)
			expect(body.systemInstruction).toEqual({
				parts: [{ text: 'Be concise' }],
			})
		})
	})

	describe('promptJSON', () => {
		beforeEach(() => {
			client = new GeminiAPIClient(config)
		})

		it('should parse valid JSON response', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: '{"name": "Test", "value": 42}' }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 15,
					candidatesTokenCount: 10,
					totalTokenCount: 25,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			const result = await client.promptJSON<{ name: string; value: number }>('Get JSON data')

			expect(result.data).toEqual({ name: 'Test', value: 42 })
			expect(result.usage.input_tokens).toBe(15)
			expect(result.usage.output_tokens).toBe(10)
		})

		it('should strip markdown code blocks with json tag', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: '```json\n{"status": "ok"}\n```' }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 10,
					candidatesTokenCount: 8,
					totalTokenCount: 18,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			const result = await client.promptJSON<{ status: string }>('Get status')

			expect(result.data).toEqual({ status: 'ok' })
		})

		it('should strip markdown code blocks without json tag', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: '```\n{"result": true}\n```' }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 10,
					candidatesTokenCount: 8,
					totalTokenCount: 18,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			const result = await client.promptJSON<{ result: boolean }>('Get result')

			expect(result.data).toEqual({ result: true })
		})

		it('should add JSON instruction to system prompt', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: '{"ok": true}' }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 20,
					candidatesTokenCount: 5,
					totalTokenCount: 25,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			await client.promptJSON('Get data', {
				systemInstruction: 'Custom instruction',
			})

			const callArgs = fetchMock.mock.calls[0]
			const body = JSON.parse(callArgs[1].body)

			expect(body.systemInstruction.parts[0].text).toContain('Custom instruction')
			expect(body.systemInstruction.parts[0].text).toContain('valid JSON only')
		})

		it('should handle invalid JSON with error message', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: 'This is not JSON' }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 10,
					candidatesTokenCount: 5,
					totalTokenCount: 15,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			await expect(client.promptJSON('Get data')).rejects.toThrow('Failed to parse JSON')
		})

		it('should include response in error message on parse failure', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: 'Invalid JSON content' }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 10,
					candidatesTokenCount: 5,
					totalTokenCount: 15,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			try {
				await client.promptJSON('Get data')
				expect.fail('Should have thrown an error')
			} catch (error) {
				expect(error).toBeInstanceOf(Error)
				if (error instanceof Error) {
					expect(error.message).toContain('Invalid JSON content')
				}
			}
		})

		it('should handle complex nested JSON', async () => {
			const complexData = {
				user: {
					id: 123,
					name: 'Test User',
					tags: ['admin', 'verified'],
					metadata: {
						lastLogin: '2025-01-01',
						preferences: { theme: 'dark' },
					},
				},
			}

			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: JSON.stringify(complexData) }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 20,
					candidatesTokenCount: 50,
					totalTokenCount: 70,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			const result = await client.promptJSON<typeof complexData>('Get user data')

			expect(result.data).toEqual(complexData)
		})
	})

	describe('healthCheck', () => {
		beforeEach(() => {
			client = new GeminiAPIClient(config)
		})

		it('should return healthy status on successful check', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: 'Hi' }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 1,
					candidatesTokenCount: 1,
					totalTokenCount: 2,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			const health = await client.healthCheck()

			expect(health.healthy).toBe(true)
			expect(health.latency).toBeGreaterThanOrEqual(0)
			expect(health.error).toBeUndefined()
		})

		it('should measure latency', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: 'Hi' }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 1,
					candidatesTokenCount: 1,
					totalTokenCount: 2,
				},
			}

			fetchMock.mockImplementationOnce(
				() =>
					new Promise(resolve => {
						setTimeout(() => {
							resolve({
								ok: true,
								json: async () => mockResponse,
							})
						}, 50)
					})
			)

			const health = await client.healthCheck()

			expect(health.healthy).toBe(true)
			// Allow 10ms tolerance for JavaScript timing imprecision
			expect(health.latency).toBeGreaterThanOrEqual(40)
		})

		it('should return unhealthy status on error', async () => {
			fetchMock.mockRejectedValueOnce(new Error('Connection failed'))

			const health = await client.healthCheck()

			expect(health.healthy).toBe(false)
			expect(health.latency).toBeGreaterThanOrEqual(0)
			expect(health.error).toBe('Connection failed')
		})

		it('should handle API errors in health check', async () => {
			fetchMock.mockResolvedValueOnce({
				ok: false,
				status: 401,
				text: async () => JSON.stringify({ error: { message: 'Invalid API key' } }),
			})

			const health = await client.healthCheck()

			expect(health.healthy).toBe(false)
			expect(health.error).toContain('Invalid API key')
		})

		it('should track latency even on failure', async () => {
			fetchMock.mockImplementationOnce(
				() =>
					new Promise((_, reject) => {
						setTimeout(() => {
							reject(new Error('Timeout'))
						}, 30)
					})
			)

			const health = await client.healthCheck()

			expect(health.healthy).toBe(false)
			// Allow 10ms tolerance for JavaScript timing imprecision
			expect(health.latency).toBeGreaterThanOrEqual(20)
		})
	})
})
