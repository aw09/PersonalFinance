// Lightweight Gemini / Generative Language API wrapper for fallback replies
export async function generateGeminiReply(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    // Use the Google Generative Language endpoint with an API key.
    // We target a conservative model (text-bison-001) for compatibility.
    const url = `https://generativelanguage.googleapis.com/v1/models/text-bison-001:generate?key=${apiKey}`

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: {
          text: prompt
        },
        temperature: 0.2,
        maxOutputTokens: 512
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!resp.ok) {
      const txt = await resp.text()
      console.error('Gemini API returned error', resp.status, txt)
      throw new Error('LLM request failed')
    }

    const data = await resp.json()

    // Try a few common response shapes
    let text = ''
    if (data.candidates && data.candidates[0]) {
      const cand = data.candidates[0]
      if (typeof cand.output === 'string') text = cand.output
      else if (cand.content) {
        if (Array.isArray(cand.content)) {
          text = cand.content.map((c: any) => c.text || '').join('')
        } else if (typeof cand.content === 'string') {
          text = cand.content
        } else if (cand.content.text) {
          text = cand.content.text
        }
      } else if (cand.message && cand.message.content) {
        text = cand.message.content
      }
    } else if (data.output && Array.isArray(data.output) && data.output[0]?.content) {
      const parts = data.output[0].content
      text = parts.map((p: any) => p.text || '').join('')
    }

    return (text || 'Sorry, I could not generate a reply right now.').trim()
  } catch (err) {
    console.error('Error calling Gemini:', err)
    return 'Sorry, I couldn\'t process that right now. Please try again later.'
  }
}
