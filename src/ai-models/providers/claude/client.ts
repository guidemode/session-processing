/**
 * Claude API Client
 * Wrapper for Anthropic's Claude API
 */

import type { ContentBlock } from '@guidemode/types'

/**
 * Tool definition for Claude API
 */
export interface ClaudeTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

/**
 * Tool choice configuration
 */
export type ClaudeToolChoice = { type: 'auto' } | { type: 'any' } | { type: 'tool'; name: string }

export interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

export interface ClaudeRequest {
  model: string
  max_tokens: number
  messages: ClaudeMessage[]
  temperature?: number
  system?: string
  tools?: ClaudeTool[]
  tool_choice?: ClaudeToolChoice
}

export interface ClaudeResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: Array<{
    type: 'text'
    text: string
  }>
  model: string
  stop_reason: string
  usage: {
    input_tokens: number
    output_tokens: number
  }
}

export interface ClaudeClientConfig {
  apiKey: string
  model?: string
  maxTokens?: number
  temperature?: number
  timeout?: number
  fetch?: typeof fetch
}

export class ClaudeAPIClient {
  private apiKey: string
  private baseUrl = 'https://api.anthropic.com/v1'
  private defaultModel: string
  private defaultMaxTokens: number
  private defaultTemperature: number | undefined
  private timeout: number
  private fetchFn: typeof fetch

  constructor(config: ClaudeClientConfig) {
    this.apiKey = config.apiKey
    this.defaultModel = config.model || 'claude-sonnet-5'
    this.defaultMaxTokens = config.maxTokens || 4096
    this.defaultTemperature = config.temperature
    this.timeout = config.timeout || 60000 // 60 seconds
    this.fetchFn = config.fetch || fetch
  }

  /**
   * Send a message to Claude and get a response
   */
  async sendMessage(
    messages: ClaudeMessage[],
    options?: {
      model?: string
      maxTokens?: number
      temperature?: number
      system?: string
    }
  ): Promise<ClaudeResponse> {
    const temperature = options?.temperature ?? this.defaultTemperature
    const request: ClaudeRequest = {
      model: options?.model || this.defaultModel,
      max_tokens: options?.maxTokens || this.defaultMaxTokens,
      messages,
      ...(temperature !== undefined && { temperature }),
      ...(options?.system && { system: options.system }),
    }

    try {
      const response = await this.makeRequest('/messages', request)
      return response as ClaudeResponse
    } catch (error) {
      // Newer Claude models reject the temperature parameter entirely
      // ("`temperature` is deprecated for this model") — retry without it.
      if (
        temperature !== undefined &&
        error instanceof Error &&
        error.message.includes('`temperature` is deprecated')
      ) {
        const { temperature: _omitted, ...withoutTemperature } = request
        const response = await this.makeRequest('/messages', withoutTemperature)
        return response as ClaudeResponse
      }
      throw error
    }
  }

  /**
   * Send a prompt and get a text response
   */
  async prompt(
    prompt: string,
    options?: {
      model?: string
      maxTokens?: number
      temperature?: number
      system?: string
    }
  ): Promise<{ text: string; usage: { input_tokens: number; output_tokens: number } }> {
    const messages: ClaudeMessage[] = [
      {
        role: 'user',
        content: prompt,
      },
    ]

    const response = await this.sendMessage(messages, options)

    // Extract text from response
    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')

    return {
      text,
      usage: response.usage,
    }
  }

  /**
   * Send a prompt expecting JSON response
   */
  async promptJSON<T = unknown>(
    prompt: string,
    options?: {
      model?: string
      maxTokens?: number
      temperature?: number
      system?: string
    }
  ): Promise<{ data: T; usage: { input_tokens: number; output_tokens: number } }> {
    // Add JSON formatting instruction to system prompt
    const systemPrompt = options?.system
      ? `${options.system}\n\nIMPORTANT: Respond with valid JSON only. Do not include markdown code blocks or any other text.`
      : 'Respond with valid JSON only. Do not include markdown code blocks or any other text.'

    const result = await this.prompt(prompt, {
      ...options,
      system: systemPrompt,
    })

    // Parse JSON from response
    let jsonText = result.text.trim()

    // Remove markdown code blocks if present
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\s*\n/, '').replace(/\n```$/, '')
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\s*\n/, '').replace(/\n```$/, '')
    }

    try {
      const data = JSON.parse(jsonText) as T
      return {
        data,
        usage: result.usage,
      }
    } catch (error) {
      throw new Error(
        `Failed to parse JSON response: ${error instanceof Error ? error.message : 'Unknown error'}\nResponse: ${jsonText}`
      )
    }
  }

  /**
   * Test the API connection
   */
  async healthCheck(): Promise<{ healthy: boolean; latency: number; error?: string }> {
    const startTime = Date.now()

    try {
      await this.prompt('Hello', { maxTokens: 10 })
      return {
        healthy: true,
        latency: Date.now() - startTime,
      }
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Make a request to the Claude API
   */
  private async makeRequest(endpoint: string, body: unknown): Promise<unknown> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await this.fetchFn(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = errorText
        try {
          const errorJson = JSON.parse(errorText)
          if (errorJson.error?.message) {
            errorMessage = errorJson.error.message
          }
        } catch {
          if (errorText.length > 200) {
            errorMessage = `${errorText.substring(0, 200)}...`
          }
        }
        throw new Error(`Claude API error (${response.status}): ${errorMessage}`)
      }

      return await response.json()
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`)
      }

      throw error
    }
  }
}
