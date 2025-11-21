/**
 * Gemini API Client
 * Wrapper for Google's Gemini API
 */

export interface GeminiMessage {
  role: 'user' | 'model'
  parts: Array<{ text: string }>
}

export interface GeminiRequest {
  contents: GeminiMessage[]
  generationConfig?: {
    temperature?: number
    topK?: number
    topP?: number
    maxOutputTokens?: number
    responseMimeType?: string
  }
  systemInstruction?: {
    parts: Array<{ text: string }>
  }
}

export interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>
      role: string
    }
    finishReason: string
    index: number
  }>
  usageMetadata: {
    promptTokenCount: number
    candidatesTokenCount: number
    totalTokenCount: number
  }
}

export interface GeminiModel {
  name: string
  displayName: string
  description: string
  supportedGenerationMethods: string[]
}

export interface GeminiModelsResponse {
  models: GeminiModel[]
}

export interface GeminiClientConfig {
  apiKey: string
  model?: string
  maxOutputTokens?: number
  temperature?: number
  timeout?: number
  fetch?: typeof fetch
}

export class GeminiAPIClient {
  private apiKey: string
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta'
  private defaultModel: string
  private defaultMaxOutputTokens: number
  private defaultTemperature: number
  private timeout: number
  private fetchFn: typeof fetch

  constructor(config: GeminiClientConfig) {
    this.apiKey = config.apiKey
    this.defaultModel = config.model || 'gemini-2.0-flash'
    this.defaultMaxOutputTokens = config.maxOutputTokens || 8192
    this.defaultTemperature = config.temperature ?? 1.0
    this.timeout = config.timeout || 60000 // 60 seconds
    // Bind fetch to preserve 'this' context in Cloudflare Workers
    this.fetchFn = config.fetch || ((...args) => fetch(...args))
  }

  /**
   * Generate content with Gemini
   */
  async generateContent(
    messages: GeminiMessage[],
    options?: {
      model?: string
      maxOutputTokens?: number
      temperature?: number
      systemInstruction?: string
      responseMimeType?: string
    }
  ): Promise<GeminiResponse> {
    const model = options?.model || this.defaultModel

    const request: GeminiRequest = {
      contents: messages,
      generationConfig: {
        temperature: options?.temperature ?? this.defaultTemperature,
        maxOutputTokens: options?.maxOutputTokens || this.defaultMaxOutputTokens,
        ...(options?.responseMimeType && { responseMimeType: options.responseMimeType }),
      },
    }

    if (options?.systemInstruction) {
      request.systemInstruction = {
        parts: [{ text: options.systemInstruction }],
      }
    }

    const response = await this.makeRequest(model, request)
    return response as GeminiResponse
  }

  /**
   * Send a prompt and get a text response
   */
  async prompt(
    prompt: string,
    options?: {
      model?: string
      maxOutputTokens?: number
      temperature?: number
      systemInstruction?: string
    }
  ): Promise<{ text: string; usage: { input_tokens: number; output_tokens: number } }> {
    const messages: GeminiMessage[] = [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ]

    const response = await this.generateContent(messages, options)

    // Extract text from response
    const text = response.candidates[0]?.content.parts.map(part => part.text).join('\n') || ''

    return {
      text,
      usage: {
        input_tokens: response.usageMetadata.promptTokenCount,
        output_tokens: response.usageMetadata.candidatesTokenCount,
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
      maxOutputTokens?: number
      temperature?: number
      systemInstruction?: string
    }
  ): Promise<{ data: T; usage: { input_tokens: number; output_tokens: number } }> {
    // Add JSON formatting instruction to system prompt
    const systemPrompt = options?.systemInstruction
      ? `${options.systemInstruction}\n\nIMPORTANT: Respond with valid JSON only. Do not include markdown code blocks or any other text.`
      : 'Respond with valid JSON only. Do not include markdown code blocks or any other text.'

    const result = await this.prompt(prompt, {
      ...options,
      systemInstruction: systemPrompt,
      // Request JSON MIME type for better formatting
      // responseMimeType: 'application/json' // Commented out as it may not work with all models
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
  async listModels(): Promise<GeminiModel[]> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const url = `${this.baseUrl}/models?key=${this.apiKey}`

      const response = await this.fetchFn(url, {
        method: 'GET',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Failed to fetch models (${response.status})`)
      }

      const data = (await response.json()) as GeminiModelsResponse
      return data.models
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
      await this.prompt('Hello', { maxOutputTokens: 10 })
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
   * Make a request to the Gemini API
   */
  private async makeRequest(model: string, body: GeminiRequest): Promise<unknown> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const endpoint = `${this.baseUrl}/models/${model}:generateContent`
      const url = `${endpoint}?key=${this.apiKey}`

      const response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
          // Extract meaningful error message from Gemini API error format
          if (errorJson.error?.message) {
            errorMessage = errorJson.error.message
          } else if (errorJson.error?.status) {
            errorMessage = errorJson.error.status
          }
        } catch {
          // If not JSON, use raw text (truncate if too long)
          if (errorText.length > 200) {
            errorMessage = `${errorText.substring(0, 200)}...`
          }
        }

        throw new Error(`Gemini API error (${response.status}): ${errorMessage}`)
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
