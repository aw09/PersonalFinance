// @ts-nocheck

import { generateGeminiReply } from '@/lib/gemini'

const describeWithKey = process.env.GEMINI_API_KEY ? describe : describe.skip

describeWithKey('Gemini LLM E2E', () => {
  beforeAll(() => {
    jest.setTimeout(30000)
  })

  it('returns a useful response for capability queries', async () => {
    const prompt = 'In one or two sentences, explain how a personal finance assistant can help me manage budgets and spending.'
    const response = await generateGeminiReply(prompt, {
      intent: 'telegram_capabilities_test'
    })

    expect(response.text.length).toBeGreaterThan(40)
    expect(response.text.toLowerCase()).not.toContain('sorry, i could not generate a reply')
    expect(response.text.toLowerCase()).toMatch(/budget|spend|finance/)
  })
})
