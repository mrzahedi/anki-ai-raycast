import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AISettings, Message } from '../ai/types';
import { openaiProvider } from '../ai/providers/openai';
import { anthropicProvider } from '../ai/providers/anthropic';
import { geminiProvider } from '../ai/providers/gemini';

const baseSettings: AISettings = {
  provider: 'openai',
  apiKey: 'test-key-123',
  model: 'gpt-4o-mini',
  maxOutputTokens: 1024,
  temperature: 0.3,
  noteTypeMode: 'auto',
  maxClozesPerCard: 2,
  dryRun: false,
  basicModelName: 'Basic',
  clozeModelName: 'Cloze',
};

const testMessages: Message[] = [
  { role: 'system', content: 'You are a test assistant.' },
  { role: 'user', content: 'Create a flashcard.' },
];

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe('OpenAI provider', () => {
  it('sends correct request format', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"cards": []}' } }],
        }),
        { status: 200 }
      )
    );

    await openaiProvider.generate(testMessages, baseSettings);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(options?.method).toBe('POST');

    const headers = options?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-key-123');
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options?.body as string);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.messages).toEqual(testMessages);
    expect(body.max_tokens).toBe(1024);
    expect(body.temperature).toBe(0.3);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('returns the response content', async () => {
    const content = '{"selectedNoteType": "BASIC", "cards": [{"front": "Q", "back": "A"}]}';
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
    );

    const result = await openaiProvider.generate(testMessages, baseSettings);
    expect(result).toBe(content);
  });

  it('throws on API error', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));

    await expect(openaiProvider.generate(testMessages, baseSettings)).rejects.toThrow(
      'OpenAI API error (401)'
    );
  });

  it('returns empty string when no choices', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [] }), { status: 200 })
    );

    const result = await openaiProvider.generate(testMessages, baseSettings);
    expect(result).toBe('');
  });
});

describe('Anthropic provider', () => {
  const anthropicSettings = { ...baseSettings, provider: 'anthropic' as const, model: 'claude-sonnet-4-20250514' };

  it('sends correct request format with system separated', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ content: [{ type: 'text', text: '{"cards": []}' }] }),
        { status: 200 }
      )
    );

    await anthropicProvider.generate(testMessages, anthropicSettings);

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');

    const headers = options?.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('test-key-123');
    expect(headers['anthropic-version']).toBe('2023-06-01');

    const body = JSON.parse(options?.body as string);
    expect(body.system).toBe('You are a test assistant.');
    expect(body.messages).toEqual([{ role: 'user', content: 'Create a flashcard.' }]);
    expect(body.max_tokens).toBe(1024);
    expect(body.temperature).toBe(0.3);
    expect(body.model).toBe('claude-sonnet-4-20250514');
  });

  it('returns text content', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ content: [{ type: 'text', text: 'result text' }] }),
        { status: 200 }
      )
    );

    const result = await anthropicProvider.generate(testMessages, anthropicSettings);
    expect(result).toBe('result text');
  });

  it('throws on API error', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Rate limited', { status: 429 }));

    await expect(anthropicProvider.generate(testMessages, anthropicSettings)).rejects.toThrow(
      'Anthropic API error (429)'
    );
  });

  it('returns empty string when no text block found', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ content: [{ type: 'tool_use', text: 'ignored' }] }), {
        status: 200,
      })
    );

    const result = await anthropicProvider.generate(testMessages, anthropicSettings);
    expect(result).toBe('');
  });
});

describe('Gemini provider', () => {
  const geminiSettings = { ...baseSettings, provider: 'gemini' as const, model: 'gemini-2.0-flash' };

  it('sends correct request format with API key in URL', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"cards": []}' }] } }],
        }),
        { status: 200 }
      )
    );

    await geminiProvider.generate(testMessages, geminiSettings);

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('gemini-2.0-flash');
    expect(url).toContain('key=test-key-123');

    const body = JSON.parse(options?.body as string);
    expect(body.systemInstruction.parts[0].text).toBe('You are a test assistant.');
    expect(body.contents).toHaveLength(1);
    expect(body.contents[0].role).toBe('user');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.maxOutputTokens).toBe(1024);
  });

  it('returns generated text', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'generated content' }] } }],
        }),
        { status: 200 }
      )
    );

    const result = await geminiProvider.generate(testMessages, geminiSettings);
    expect(result).toBe('generated content');
  });

  it('throws on API error', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Bad request', { status: 400 }));

    await expect(geminiProvider.generate(testMessages, geminiSettings)).rejects.toThrow(
      'Gemini API error (400)'
    );
  });

  it('returns empty when no candidates', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ candidates: [] }), { status: 200 })
    );

    const result = await geminiProvider.generate(testMessages, geminiSettings);
    expect(result).toBe('');
  });
});
