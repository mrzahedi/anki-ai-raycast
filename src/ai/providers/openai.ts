import { AIProviderAdapter, AISettings, Message } from '../types';

export const openaiProvider: AIProviderAdapter = {
  async generate(messages: Message[], settings: AISettings): Promise<string> {
    const url = settings.baseUrl
      ? `${settings.baseUrl.replace(/\/+$/, '')}/chat/completions`
      : 'https://api.openai.com/v1/chat/completions';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        max_tokens: settings.maxOutputTokens,
        temperature: settings.temperature,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${err}`);
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };

    return data.choices[0]?.message?.content || '';
  },
};
