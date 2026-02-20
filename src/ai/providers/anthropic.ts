import { AIProviderAdapter, AISettings, Message } from '../types';

export const anthropicProvider: AIProviderAdapter = {
  async generate(messages: Message[], settings: AISettings): Promise<string> {
    const url = settings.baseUrl
      ? `${settings.baseUrl.replace(/\/+$/, '')}/messages`
      : 'https://api.anthropic.com/v1/messages';

    const systemMsg = messages.find(m => m.role === 'system');
    const userMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: settings.maxOutputTokens,
        temperature: settings.temperature,
        system: systemMsg?.content || '',
        messages: userMessages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${err}`);
    }

    const data = (await response.json()) as {
      content: { type: string; text: string }[];
    };

    const textBlock = data.content.find(b => b.type === 'text');
    return textBlock?.text || '';
  },
};
