import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GeminiModelAdapter } from '../../../../src/ai-models/providers/gemini/index.js'
import { BaseModelTask } from '../../../../src/ai-models/base/model-task.js'
import type {
	ModelAdapterConfig,
	ModelTaskConfig,
	ModelTaskContext,
} from '../../../../src/ai-models/base/types.js'
import type { GeminiResponse } from '../../../../src/ai-models/providers/gemini/client.js'
import { MOCK_CONTEXT, MOCK_SESSION } from '../../fixtures/mock-sessions.js'

// Test task implementations
interface SimpleInput {
	message: string
}

type SimpleOutput = string

class SimpleTask extends BaseModelTask<SimpleInput, SimpleOutput> {
	readonly taskType = 'simple-task'
	readonly name = 'Simple Task'
	readonly description = 'A simple test task'

	getConfig(): ModelTaskConfig {
		return {
			taskType: this.taskType,
			prompt: 'Process this message: {{message}}',
			responseFormat: { type: 'text' },
			recordingStrategy: {},
		}
	}

	prepareInput(_context: ModelTaskContext): SimpleInput {
		return {
			message: 'test message',
		}
	}

	processOutput(output: SimpleOutput, _context: ModelTaskContext): SimpleOutput {
		return output.toUpperCase()
	}
}

interface JsonInput {
	data: string
}

interface JsonOutput {
	result: string
	success: boolean
}

class JsonTask extends BaseModelTask<JsonInput, JsonOutput> {
	readonly taskType = 'json-task'
	readonly name = 'JSON Task'
	readonly description = 'A task with JSON response'

	getConfig(): ModelTaskConfig {
		return {
			taskType: this.taskType,
			prompt: 'Process JSON data: {{data}}',
			responseFormat: {
				type: 'json',
				schema: {
					type: 'object',
					properties: {
						result: { type: 'string' },
						success: { type: 'boolean' },
					},
					required: ['result', 'success'],
				},
			},
			recordingStrategy: {},
		}
	}

	prepareInput(_context: ModelTaskContext): JsonInput {
		return {
			data: 'test data',
		}
	}
}

class FailingTask extends BaseModelTask {
	readonly taskType = 'failing-task'
	readonly name = 'Failing Task'
	readonly description = 'A task that fails validation'

	getConfig(): ModelTaskConfig {
		return {
			taskType: this.taskType,
			prompt: 'This should fail',
			responseFormat: { type: 'text' },
			recordingStrategy: {},
		}
	}

	prepareInput(_context: ModelTaskContext) {
		return {}
	}

	canExecute(_context: ModelTaskContext): boolean {
		return false
	}
}

describe('GeminiModelAdapter', () => {
	let adapter: GeminiModelAdapter
	let config: ModelAdapterConfig
	let fetchMock: ReturnType<typeof vi.fn>

	beforeEach(() => {
		config = {
			apiKey: 'test-gemini-key',
			model: 'gemini-2.0-flash-lite',
			maxTokens: 8192,
			temperature: 1.0,
			timeout: 60000,
		}

		fetchMock = vi.fn()
		global.fetch = fetchMock
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe('Initialization', () => {
		it('should initialize with correct configuration', () => {
			adapter = new GeminiModelAdapter(config)

			expect(adapter).toBeDefined()
			expect(adapter.name).toBe('gemini')
			expect(adapter.description).toBe('Google Gemini API adapter for AI model tasks')
		})

		it('should use default model if not provided', () => {
			const configWithoutModel = { ...config, model: undefined }
			adapter = new GeminiModelAdapter(configWithoutModel)

			expect(adapter).toBeDefined()
		})

		it('should use default maxTokens if not provided', () => {
			const configWithoutTokens = { ...config, maxTokens: undefined }
			adapter = new GeminiModelAdapter(configWithoutTokens)

			expect(adapter).toBeDefined()
		})

		it('should use default temperature if not provided', () => {
			const configWithoutTemp = { ...config, temperature: undefined }
			adapter = new GeminiModelAdapter(configWithoutTemp)

			expect(adapter).toBeDefined()
		})

		it('should accept temperature of 0', () => {
			const configWithZeroTemp = { ...config, temperature: 0 }
			adapter = new GeminiModelAdapter(configWithZeroTemp)

			expect(adapter).toBeDefined()
		})
	})

	describe('Task Registration', () => {
		beforeEach(() => {
			adapter = new GeminiModelAdapter(config)
		})

		it('should register a task', () => {
			const task = new SimpleTask()
			adapter.registerTask(task)

			const availableTasks = adapter.getAvailableTasks()
			expect(availableTasks).toHaveLength(1)
			expect(availableTasks[0].taskType).toBe('simple-task')
		})

		it('should register multiple tasks', () => {
			const task1 = new SimpleTask()
			const task2 = new JsonTask()

			adapter.registerTask(task1)
			adapter.registerTask(task2)

			const availableTasks = adapter.getAvailableTasks()
			expect(availableTasks).toHaveLength(2)
		})

		it('should return empty array when no tasks registered', () => {
			const availableTasks = adapter.getAvailableTasks()
			expect(availableTasks).toEqual([])
		})
	})

	describe('Text Task Execution', () => {
		beforeEach(() => {
			adapter = new GeminiModelAdapter(config)
		})

		it('should execute text task successfully', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: 'processed response' }],
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

			const task = new SimpleTask()
			const result = await adapter.executeTask(task, MOCK_CONTEXT)

			expect(result.success).toBe(true)
			expect(result.taskType).toBe('simple-task')
			expect(result.output).toBe('PROCESSED RESPONSE')
			expect(result.metadata.tokensUsed).toBe(30)
			expect(result.metadata.modelUsed).toBe('gemini-2.0-flash-lite')
		})

		it('should include processing time in metadata', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: 'response' }],
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

			const task = new SimpleTask()
			const result = await adapter.executeTask(task, MOCK_CONTEXT)

			expect(result.metadata.processingTime).toBeDefined()
			expect(result.metadata.processingTime).toBeGreaterThanOrEqual(0)
		})

		it('should calculate cost for task execution', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: 'response' }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 1000,
					candidatesTokenCount: 500,
					totalTokenCount: 1500,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			const task = new SimpleTask()
			const result = await adapter.executeTask(task, MOCK_CONTEXT)

			expect(result.metadata.cost).toBeDefined()
			expect(result.metadata.cost).toBeGreaterThan(0)
		})

		it('should format prompt with input variables', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: 'response' }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 15,
					candidatesTokenCount: 5,
					totalTokenCount: 20,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			const task = new SimpleTask()
			await adapter.executeTask(task, MOCK_CONTEXT)

			const callArgs = fetchMock.mock.calls[0]
			const body = JSON.parse(callArgs[1].body)

			// Check that the prompt was formatted with the variable
			expect(body.contents[0].parts[0].text).toContain('test message')
		})
	})

	describe('JSON Task Execution', () => {
		beforeEach(() => {
			adapter = new GeminiModelAdapter(config)
		})

		it('should execute JSON task successfully', async () => {
			const jsonData = {
				result: 'success',
				success: true,
			}

			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: JSON.stringify(jsonData) }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 25,
					candidatesTokenCount: 15,
					totalTokenCount: 40,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			const task = new JsonTask()
			const result = await adapter.executeTask(task, MOCK_CONTEXT)

			expect(result.success).toBe(true)
			expect(result.output).toEqual(jsonData)
			expect(result.metadata.tokensUsed).toBe(40)
		})

		it('should handle JSON responses with markdown code blocks', async () => {
			const jsonData = {
				result: 'data',
				success: true,
			}

			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: `\`\`\`json\n${JSON.stringify(jsonData)}\n\`\`\`` }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 20,
					candidatesTokenCount: 12,
					totalTokenCount: 32,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			const task = new JsonTask()
			const result = await adapter.executeTask(task, MOCK_CONTEXT)

			expect(result.success).toBe(true)
			expect(result.output).toEqual(jsonData)
		})

		it('should handle complex nested JSON', async () => {
			const complexData = {
				result: 'nested data',
				success: true,
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
					promptTokenCount: 30,
					candidatesTokenCount: 25,
					totalTokenCount: 55,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			const task = new JsonTask()
			const result = await adapter.executeTask(task, MOCK_CONTEXT)

			expect(result.success).toBe(true)
			expect(result.output).toEqual(complexData)
		})
	})

	describe('Error Handling', () => {
		beforeEach(() => {
			adapter = new GeminiModelAdapter(config)
		})

		it('should handle task validation failure', async () => {
			const task = new FailingTask()
			const result = await adapter.executeTask(task, MOCK_CONTEXT)

			expect(result.success).toBe(false)
			expect(result.output).toBeNull()
			expect(result.metadata.error).toContain('cannot be executed')
		})

		it('should handle API errors gracefully', async () => {
			fetchMock.mockResolvedValueOnce({
				ok: false,
				status: 500,
				text: async () => 'Internal server error',
			})

			const task = new SimpleTask()
			const result = await adapter.executeTask(task, MOCK_CONTEXT)

			expect(result.success).toBe(false)
			expect(result.output).toBeNull()
			expect(result.metadata.error).toBeDefined()
		})

		it('should handle network errors', async () => {
			fetchMock.mockRejectedValueOnce(new Error('Network failure'))

			const task = new SimpleTask()
			const result = await adapter.executeTask(task, MOCK_CONTEXT)

			expect(result.success).toBe(false)
			expect(result.output).toBeNull()
			expect(result.metadata.error).toContain('Network failure')
		})

		it('should track processing time even on error', async () => {
			fetchMock.mockRejectedValueOnce(new Error('API error'))

			const task = new SimpleTask()
			const result = await adapter.executeTask(task, MOCK_CONTEXT)

			expect(result.metadata.processingTime).toBeDefined()
			expect(result.metadata.processingTime).toBeGreaterThanOrEqual(0)
		})

		it('should include error details in metadata', async () => {
			const errorMessage = 'Rate limit exceeded'

			fetchMock.mockResolvedValueOnce({
				ok: false,
				status: 429,
				text: async () => JSON.stringify({ error: { message: errorMessage } }),
			})

			const task = new SimpleTask()
			const result = await adapter.executeTask(task, MOCK_CONTEXT)

			expect(result.success).toBe(false)
			expect(result.metadata.error).toContain(errorMessage)
		})

		it('should handle JSON parsing errors', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: 'This is not valid JSON' }],
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

			const task = new JsonTask()
			const result = await adapter.executeTask(task, MOCK_CONTEXT)

			expect(result.success).toBe(false)
			expect(result.metadata.error).toContain('Failed to parse JSON')
		})
	})

	describe('Health Check', () => {
		beforeEach(() => {
			adapter = new GeminiModelAdapter(config)
		})

		it('should pass health check with valid configuration', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: 'Hello' }],
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

			const health = await adapter.healthCheck()

			expect(health.healthy).toBe(true)
			expect(health.latency).toBeDefined()
			expect(health.latency).toBeGreaterThanOrEqual(0)
		})

		it('should fail health check with invalid configuration', async () => {
			const invalidAdapter = new GeminiModelAdapter({ ...config, apiKey: '' })
			const health = await invalidAdapter.healthCheck()

			expect(health.healthy).toBe(false)
			expect(health.error).toBe('Invalid configuration')
		})

		it('should fail health check on API error', async () => {
			fetchMock.mockResolvedValueOnce({
				ok: false,
				status: 401,
				text: async () => JSON.stringify({ error: { message: 'Invalid API key' } }),
			})

			const health = await adapter.healthCheck()

			expect(health.healthy).toBe(false)
			expect(health.error).toContain('Invalid API key')
		})

		it('should measure latency in health check', async () => {
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

			const health = await adapter.healthCheck()

			expect(health.healthy).toBe(true)
			// 10ms tolerance for JavaScript timing imprecision: `setTimeout(50)` regularly
			// measures 49ms across `Date.now()`, so asserting the delay exactly is flaky.
			expect(health.latency).toBeGreaterThanOrEqual(40)
		})

		it('should track latency even on health check failure', async () => {
			fetchMock.mockImplementationOnce(
				() =>
					new Promise((_, reject) => {
						setTimeout(() => {
							reject(new Error('Connection timeout'))
						}, 30)
					})
			)

			const health = await adapter.healthCheck()

			expect(health.healthy).toBe(false)
			// Allow 10ms tolerance for JavaScript timing imprecision
			expect(health.latency).toBeGreaterThanOrEqual(20)
		})
	})

	describe('Adapter Information', () => {
		beforeEach(() => {
			adapter = new GeminiModelAdapter(config)
		})

		it('should return adapter info', () => {
			const info = adapter.getInfo()

			expect(info.name).toBe('gemini')
			expect(info.description).toBe('Google Gemini API adapter for AI model tasks')
			expect(info.model).toBe('gemini-2.0-flash-lite')
			expect(info.availableTasks).toBeDefined()
			expect(Array.isArray(info.availableTasks)).toBe(true)
		})

		it('should include registered tasks in info', () => {
			const task1 = new SimpleTask()
			const task2 = new JsonTask()

			adapter.registerTask(task1)
			adapter.registerTask(task2)

			const info = adapter.getInfo()

			expect(info.availableTasks).toHaveLength(2)
			expect(info.availableTasks[0].taskType).toBe('simple-task')
			expect(info.availableTasks[1].taskType).toBe('json-task')
		})

		it('should return empty tasks array when none registered', () => {
			const info = adapter.getInfo()

			expect(info.availableTasks).toEqual([])
		})
	})

	describe('Cost Calculation', () => {
		beforeEach(() => {
			adapter = new GeminiModelAdapter(config)
		})

		it('should calculate cost based on Gemini pricing', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: 'response' }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 100000, // 100k tokens
					candidatesTokenCount: 100000, // 100k tokens
					totalTokenCount: 200000,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			const task = new SimpleTask()
			const result = await adapter.executeTask(task, MOCK_CONTEXT)

			// Cost should be approximately:
			// Input: 100k tokens * $0.075 / 1M = $0.0075
			// Output: 100k tokens * $0.30 / 1M = $0.03
			// Total: ~$0.0375 (split 50/50 assumption)
			expect(result.metadata.cost).toBeGreaterThan(0)
			expect(result.metadata.cost).toBeLessThan(1) // Should be small amount
		})

		it('should calculate zero cost for zero tokens', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: '' }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 0,
					candidatesTokenCount: 0,
					totalTokenCount: 0,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			const task = new SimpleTask()
			const result = await adapter.executeTask(task, MOCK_CONTEXT)

			expect(result.metadata.cost).toBe(0)
		})
	})

	describe('Configuration Validation', () => {
		it('should validate correct configuration', () => {
			adapter = new GeminiModelAdapter(config)
			expect(adapter.validateConfig()).toBe(true)
		})

		it('should reject missing API key', () => {
			const invalidAdapter = new GeminiModelAdapter({ ...config, apiKey: '' })
			expect(invalidAdapter.validateConfig()).toBe(false)
		})

		it('should reject whitespace-only API key', () => {
			const invalidAdapter = new GeminiModelAdapter({ ...config, apiKey: '   ' })
			expect(invalidAdapter.validateConfig()).toBe(false)
		})

		it('should accept valid API key', () => {
			const validAdapter = new GeminiModelAdapter({ ...config, apiKey: 'valid-key-xyz' })
			expect(validAdapter.validateConfig()).toBe(true)
		})
	})

	describe('Integration', () => {
		beforeEach(() => {
			adapter = new GeminiModelAdapter(config)
		})

		it('should handle full task lifecycle', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: 'lifecycle test response' }],
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

			const task = new SimpleTask()

			// Register task
			adapter.registerTask(task)
			expect(adapter.getAvailableTasks()).toHaveLength(1)

			// Execute task
			const result = await adapter.executeTask(task, MOCK_CONTEXT)

			expect(result.success).toBe(true)
			expect(result.taskType).toBe('simple-task')
			expect(result.output).toBe('LIFECYCLE TEST RESPONSE')
			expect(result.metadata.tokensUsed).toBe(25)
			expect(result.metadata.cost).toBeGreaterThan(0)
			expect(result.metadata.processingTime).toBeGreaterThanOrEqual(0)
		})

		it('should handle multiple tasks sequentially', async () => {
			const mockResponse1: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: 'first response' }],
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

			const mockResponse2: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: '{"result": "second", "success": true}' }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 12,
					candidatesTokenCount: 8,
					totalTokenCount: 20,
				},
			}

			fetchMock
				.mockResolvedValueOnce({
					ok: true,
					json: async () => mockResponse1,
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => mockResponse2,
				})

			const task1 = new SimpleTask()
			const task2 = new JsonTask()

			const result1 = await adapter.executeTask(task1, MOCK_CONTEXT)
			const result2 = await adapter.executeTask(task2, MOCK_CONTEXT)

			expect(result1.success).toBe(true)
			expect(result1.output).toBe('FIRST RESPONSE')

			expect(result2.success).toBe(true)
			expect(result2.output).toEqual({ result: 'second', success: true })
		})

		it('should work with real session data', async () => {
			const mockResponse: GeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: 'session analysis complete' }],
							role: 'model',
						},
						finishReason: 'STOP',
						index: 0,
					},
				],
				usageMetadata: {
					promptTokenCount: 50,
					candidatesTokenCount: 20,
					totalTokenCount: 70,
				},
			}

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			})

			const context = {
				...MOCK_CONTEXT,
				session: MOCK_SESSION,
			}

			const task = new SimpleTask()
			const result = await adapter.executeTask(task, context)

			expect(result.success).toBe(true)
			expect(result.output).toBe('SESSION ANALYSIS COMPLETE')
		})
	})
})
