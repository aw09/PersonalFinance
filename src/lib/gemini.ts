import { logLLMUsage } from './llmLogger'

export interface GeminiResponse {
  text: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

// Enhanced Gemini / Generative Language API wrapper with logging and token counting
export async function generateGeminiReply(
  prompt: string,
  options: {
    userId?: string
    telegramUserId?: number
    sessionId?: string
    intent?: string
  } = {}
): Promise<GeminiResponse> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
  const startTime = Date.now()

  // Retry on 429 with exponential backoff
  const maxAttempts = 3
  let attempt = 0
  let backoff = 500

  while (attempt < maxAttempts) {
    attempt += 1
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      const body = {
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      }

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': apiKey
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })

      clearTimeout(timeoutId)
      const responseTime = Date.now() - startTime
      const respText = await resp.text()

      if (resp.status === 429) {
        console.warn('Gemini rate limited (429). Attempt', attempt)
        // Log rate limit
        if (attempt === maxAttempts) {
          await logLLMUsage({
            userId: options.userId,
            telegramUserId: options.telegramUserId,
            provider: 'gemini',
            model: 'gemini-2.0-flash',
            prompt,
            response: null,
            status: 'rate_limited',
            responseTimeMs: responseTime,
            sessionId: options.sessionId,
            intentDetected: options.intent,
            errorMessage: 'Rate limited after maximum attempts'
          })
        }
        if (attempt < maxAttempts) await new Promise(r => setTimeout(r, backoff))
        backoff *= 2
        continue
      }

      if (!resp.ok) {
        console.error('Gemini API returned error', resp.status, respText)
        // Log error
        await logLLMUsage({
          userId: options.userId,
          telegramUserId: options.telegramUserId,
          provider: 'gemini',
          model: 'gemini-2.0-flash',
          prompt,
          response: null,
          status: 'error',
          responseTimeMs: responseTime,
          sessionId: options.sessionId,
          intentDetected: options.intent,
          errorMessage: `HTTP ${resp.status}: ${respText}`
        })

        // For 404 or other client errors, don't retry
        if (resp.status >= 400 && resp.status < 500) break
        if (attempt < maxAttempts) await new Promise(r => setTimeout(r, backoff))
        backoff *= 2
        continue
      }

      // Successful response: try to parse JSON
      let data: any
      try {
        data = JSON.parse(respText)
      } catch (err) {
        // Not JSON — return raw text and log
        const result = { text: respText.trim() || 'Sorry, no reply.' }
        await logLLMUsage({
          userId: options.userId,
          telegramUserId: options.telegramUserId,
          provider: 'gemini',
          model: 'gemini-2.0-flash',
          prompt,
          response: result.text,
          status: 'success',
          responseTimeMs: responseTime,
          sessionId: options.sessionId,
          intentDetected: options.intent,
          metadata: { rawResponse: true }
        })
        return result
      }

      // Extract text and token information
      try {
        const contents = data?.results?.[0]?.content?.payload ?? data?.outputs ?? data?.contents ?? data
        let text = ''

        // Search known shapes
        if (Array.isArray(data?.results)) {
          // v1beta2 may return results with content
          for (const r of data.results) {
            const payload = r.content?.payload
            if (payload?.parts) text += payload.parts.map((p: any) => p.text || '').join('')
          }
        }

        if (!text && Array.isArray(data?.contents)) {
          for (const c of data.contents) {
            if (Array.isArray(c.parts)) text += c.parts.map((p: any) => p.text || '').join('')
          }
        }

        // fallback: inspect top-level outputs
        if (!text && Array.isArray(data?.outputs)) {
          for (const o of data.outputs) {
            if (o.content?.text) text += o.content.text
            else if (Array.isArray(o?.content)) text += o.content.map((p: any) => p.text || '').join('')
          }
        }

        if (!text && typeof data?.text === 'string') text = data.text

        const finalText = (text || 'Sorry, I could not generate a reply right now.').trim()

        // Extract token usage if available
        const usageMetadata = data?.usageMetadata
        const promptTokens = usageMetadata?.promptTokenCount
        const completionTokens = usageMetadata?.candidatesTokenCount
        const totalTokens = usageMetadata?.totalTokenCount

        // Estimate tokens if not provided (rough approximation)
        const estimatedPromptTokens = promptTokens || Math.ceil(prompt.length / 4)
        const estimatedCompletionTokens = completionTokens || Math.ceil(finalText.length / 4)
        const estimatedTotalTokens = totalTokens || (estimatedPromptTokens + estimatedCompletionTokens)

        const result: GeminiResponse = {
          text: finalText,
          promptTokens: estimatedPromptTokens,
          completionTokens: estimatedCompletionTokens,
          totalTokens: estimatedTotalTokens
        }

        // Log successful usage
        await logLLMUsage({
          userId: options.userId,
          telegramUserId: options.telegramUserId,
          provider: 'gemini',
          model: 'gemini-2.0-flash',
          prompt,
          response: finalText,
          promptTokens: estimatedPromptTokens,
          completionTokens: estimatedCompletionTokens,
          totalTokens: estimatedTotalTokens,
          status: 'success',
          responseTimeMs: responseTime,
          sessionId: options.sessionId,
          intentDetected: options.intent,
          metadata: { 
            hasUsageMetadata: !!usageMetadata,
            tokensEstimated: !promptTokens 
          }
        })

        return result
      } catch (err) {
        console.error('Error extracting Gemini content:', err, data)
        const errorText = 'Sorry, I could not parse the LLM response.'
        
        await logLLMUsage({
          userId: options.userId,
          telegramUserId: options.telegramUserId,
          provider: 'gemini',
          model: 'gemini-2.0-flash',
          prompt,
          response: errorText,
          status: 'error',
          responseTimeMs: responseTime,
          sessionId: options.sessionId,
          intentDetected: options.intent,
          errorMessage: `Content extraction error: ${err}`
        })

        return { text: errorText }
      }
    } catch (err: any) {
      console.error('Error calling Gemini (attempt', attempt, '):', err?.message || err)
      
      if (attempt === maxAttempts) {
        const errorText = 'Sorry, I couldn\'t process that right now. Please try again later.'
        await logLLMUsage({
          userId: options.userId,
          telegramUserId: options.telegramUserId,
          provider: 'gemini',
          model: 'gemini-2.0-flash',
          prompt,
          response: errorText,
          status: err.name === 'AbortError' ? 'timeout' : 'error',
          responseTimeMs: Date.now() - startTime,
          sessionId: options.sessionId,
          intentDetected: options.intent,
          errorMessage: err?.message || String(err)
        })
        return { text: errorText }
      }
      
      if (attempt < maxAttempts) await new Promise(r => setTimeout(r, backoff))
      backoff *= 2
    }
  }

  console.error('All attempts to call Gemini failed')
  const errorText = 'Sorry, I couldn\'t process that right now. Please try again later.'
  return { text: errorText }
}
