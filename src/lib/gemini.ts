// Lightweight Gemini / Generative Language API wrapper for fallback replies
export async function generateGeminiReply(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

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

      const respText = await resp.text()

      if (resp.status === 429) {
        console.warn('Gemini rate limited (429). Attempt', attempt)
        if (attempt < maxAttempts) await new Promise(r => setTimeout(r, backoff))
        backoff *= 2
        continue
      }

      if (!resp.ok) {
        console.error('Gemini API returned error', resp.status, respText)
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
        // Not JSON — return raw text
        return respText.trim() || 'Sorry, no reply.'
      }

      // The documented shape: data.contents[].parts[].text
      try {
        const contents = data?.results?.[0]?.content?.payload ?? data?.outputs ?? data?.contents ?? data
        // Normalize search for parts
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

        return (text || 'Sorry, I could not generate a reply right now.').trim()
      } catch (err) {
        console.error('Error extracting Gemini content:', err, data)
        return 'Sorry, I could not parse the LLM response.'
      }
    } catch (err: any) {
      console.error('Error calling Gemini (attempt', attempt, '):', err?.message || err)
      if (attempt < maxAttempts) await new Promise(r => setTimeout(r, backoff))
      backoff *= 2
    }
  }

  console.error('All attempts to call Gemini failed')
  return 'Sorry, I couldn\'t process that right now. Please try again later.'
}
