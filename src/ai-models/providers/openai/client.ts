/**
 * OpenAI API Client
 * Wrapper for OpenAI's Chat Completions API
 */

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface OpenAIRequest {
  model: string
  messages: OpenAIMessage[]
  temperature?: number
  max_tokens?: number
  max_completion_tokens?: number
  response_format?: { type: 'json_object' | 'text' }
}

export interface OpenAIResponse {
  id: string
  object: 'chat.completion'
  created: number
  model: string
  choices: Array<{
    index: number
    message: {
      role: 'assistant'
      content: string
    }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface OpenAIModel {
  id: string
  object: 'model'
  created: number
  owned_by: string
}

export interface OpenAIModelsResponse {
  object: 'list'
  data: OpenAIModel[]
}

export interface OpenAIClientConfig {
  apiKey: string
  model?: string
  maxTokens?: number
  temperature?: number
  timeout?: number
  fetch?: typeof fetch
  baseUrl?: string
}

export class OpenAIAPIClient {
  private apiKey: string
  private baseUrl = 'https://api.openai.com/v1'
  private defaultModel: string
  private defaultMaxTokens: number
  private defaultTemperature: number
  private timeout: number
  private fetchFn: typeof fetch

  constructor(config: OpenAIClientConfig) {
    this.apiKey = config.apiKey
    if (config.baseUrl) this.baseUrl = config.baseUrl
    this.defaultModel = config.model || 'gpt-4o-mini'
    this.defaultMaxTokens = config.maxTokens || 4096
    this.defaultTemperature = config.temperature ?? 1.0
    this.timeout = config.timeout || 60000 // 60 seconds
    this.fetchFn = config.fetch || fetch
  }

  /**
   * Send messages to OpenAI and get a response
   */
  async chat(
    messages: OpenAIMessage[],
    options?: {
      model?: string
      maxTokens?: number
      temperature?: number
      responseFormat?: 'json_object' | 'text'
    }
  ): Promise<OpenAIResponse> {
    const model = options?.model || this.defaultModel
    const maxTokens = options?.maxTokens || this.defaultMaxTokens
    const isNewModel = /^(gpt-5|o[1-9])/.test(model)

    const request: OpenAIRequest = {
      model,
      messages,
      // gpt-5.x and o-series only support temperature=1
      ...(!isNewModel && { temperature: options?.temperature ?? this.defaultTemperature }),
      ...(isNewModel
        ? { max_completion_tokens: maxTokens }
        : { max_tokens: maxTokens }),
      ...(options?.responseFormat && {
        response_format: { type: options.responseFormat },
      }),
    }

    const response = await this.makeRequest('/chat/completions', request)
    return response as OpenAIResponse
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
    const messages: OpenAIMessage[] = []

    // Add system message if provided
    if (options?.system) {
      messages.push({
        role: 'system',
        content: options.system,
      })
    }

    // Add user message
    messages.push({
      role: 'user',
      content: prompt,
    })

    const response = await this.chat(messages, {
      model: options?.model,
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
    })

    // Extract text from response
    const text = response.choices[0]?.message.content || ''

    return {
      text,
      usage: {
        input_tokens: response.usage.prompt_tokens,
        output_tokens: response.usage.completion_tokens,
      },
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
   * List available models
   */
  async listModels(): Promise<OpenAIModel[]> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await this.fetchFn(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Failed to fetch models (${response.status})`)
      }

      const data = (await response.json()) as OpenAIModelsResponse
      return data.data
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
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
   * Make a request to the OpenAI API
   */
  private async makeRequest(endpoint: string, body: OpenAIRequest): Promise<unknown> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await this.fetchFn(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()

        // Try to parse JSON error response
        let errorMessage = errorText
        try {
          const errorJson = JSON.parse(errorText)
          // Extract meaningful error message from OpenAI API error format
          if (errorJson.error?.message) {
            errorMessage = errorJson.error.message
          } else if (errorJson.error?.type) {
            errorMessage = errorJson.error.type
          }
        } catch {
          // If not JSON, use raw text (truncate if too long)
          if (errorText.length > 200) {
            errorMessage = `${errorText.substring(0, 200)}...`
          }
        }

        throw new Error(`OpenAI API error (${response.status}): ${errorMessage}`)
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
