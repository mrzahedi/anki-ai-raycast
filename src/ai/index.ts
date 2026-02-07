import { getPreferenceValues, showToast, Toast } from '@raycast/api';
import {
  AIActionContext,
  AIConvertContext,
  AISettings,
  AIResponse,
  getDefaultModel,
  Message,
} from './types';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import { parseAIResponse } from './parser';
import { mapAICardToAnkiFields } from './fieldMapper';
import { openaiProvider } from './providers/openai';
import { anthropicProvider } from './providers/anthropic';
import { geminiProvider } from './providers/gemini';

function getAISettings(): AISettings {
  const prefs = getPreferenceValues<Preferences>();
  const provider = (prefs.ai_provider || 'openai') as AISettings['provider'];
  return {
    provider,
    apiKey: prefs.ai_api_key || '',
    model: prefs.ai_model || getDefaultModel(provider),
    maxOutputTokens: parseInt(prefs.ai_max_output_tokens || '1024', 10),
    temperature: parseFloat(prefs.ai_temperature || '0.3'),
    noteTypeMode: (prefs.ai_note_type_mode || 'auto') as AISettings['noteTypeMode'],
    maxClozesPerCard: parseInt(prefs.ai_max_clozes_per_card || '2', 10),
    dryRun: prefs.ai_dry_run || false,
    basicModelName: prefs.basic_model_name || 'Basic',
    clozeModelName: prefs.cloze_model_name || 'Cloze',
  };
}

function getProvider(settings: AISettings) {
  switch (settings.provider) {
    case 'openai':
      return openaiProvider;
    case 'anthropic':
      return anthropicProvider;
    case 'gemini':
      return geminiProvider;
  }
}

async function callAI(messages: Message[], settings: AISettings): Promise<string> {
  const provider = getProvider(settings);
  return provider.generate(messages, settings);
}

async function generateAndParse(
  action: 'autocomplete' | 'improve' | 'generate' | 'convert',
  content: string,
  settings: AISettings,
  template?: AIActionContext['selectedTemplate'],
  convertMode?: 'auto' | 'basic' | 'cloze',
  count?: number
): Promise<AIResponse> {
  const systemPrompt = buildSystemPrompt(settings, template);
  const userPrompt = buildUserPrompt(action, content, convertMode, count);

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const raw = await callAI(messages, settings);
  return parseAIResponse(raw);
}

function buildContentFromFields(
  fieldValues: Record<string, string>,
  values: Record<string, unknown>
): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(fieldValues)) {
    if (key.startsWith('field_') && val) {
      parts.push(`${key.replace('field_', '')}: ${val}`);
    }
  }
  if (parts.length === 0) {
    for (const [key, val] of Object.entries(values)) {
      if (key.startsWith('field_') && typeof val === 'string' && val) {
        parts.push(`${key.replace('field_', '')}: ${val}`);
      }
    }
  }
  return parts.join('\n\n');
}

function applyAIResultToForm(
  response: AIResponse,
  ctx: AIActionContext,
  settings: AISettings
): void {
  const card = response.cards[0];
  if (!card) return;

  const mapping = mapAICardToAnkiFields(
    card,
    response.selectedNoteType,
    ctx.models,
    settings.basicModelName,
    settings.clozeModelName
  );

  if ('error' in mapping) {
    showToast({
      style: Toast.Style.Failure,
      title: 'Model Incompatibility',
      message: mapping.error,
    });
    return;
  }

  ctx.setValue('modelName', mapping.modelName);

  const newFieldValues: Record<string, string> = {};
  for (const [fieldName, fieldValue] of Object.entries(mapping.fields)) {
    newFieldValues[`field_${fieldName}`] = fieldValue;
  }
  ctx.setFieldValues(prev => ({ ...prev, ...newFieldValues }));

  if (card.tags && card.tags.length > 0) {
    const currentTags = (ctx.values.tags as string[]) || [];
    const merged = [...new Set([...currentTags, ...card.tags])];
    ctx.setValue('tags', merged);
  }

  if (response.notes) {
    const prefix = response.notes.includes('NEEDS_REVIEW') ? '⚠️ ' : '';
    showToast({
      style: Toast.Style.Success,
      title: `${prefix}AI: ${response.selectedNoteType}`,
      message: response.notes.slice(0, 100),
    });
  }
}

async function withAIErrorHandling(fn: () => Promise<void>): Promise<void> {
  const settings = getAISettings();

  if (!settings.apiKey) {
    showToast({
      style: Toast.Style.Failure,
      title: 'AI API key not configured',
      message: 'Set it in Raycast Preferences → Anki → AI API Key',
    });
    return;
  }

  try {
    await showToast({ style: Toast.Style.Animated, title: 'AI is thinking...' });
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('API error')) {
      showToast({
        style: Toast.Style.Failure,
        title: 'AI request failed',
        message: 'Check your API key and network connection',
      });
    } else if (message.includes('JSON') || message.includes('No JSON')) {
      showToast({
        style: Toast.Style.Failure,
        title: 'AI returned invalid response',
        message: message.slice(0, 120),
      });
    } else {
      showToast({
        style: Toast.Style.Failure,
        title: 'AI error',
        message: message.slice(0, 120),
      });
    }
  }
}

export async function handleAIAutocomplete(ctx: AIActionContext): Promise<void> {
  await withAIErrorHandling(async () => {
    const settings = getAISettings();
    const content = ctx.draftText || buildContentFromFields(ctx.fieldValues, ctx.values);

    if (!content.trim()) {
      showToast({
        style: Toast.Style.Failure,
        title: 'No content',
        message: 'Enter draft notes or field content first',
      });
      return;
    }

    const response = await generateAndParse(
      'autocomplete',
      content,
      settings,
      ctx.selectedTemplate
    );

    if (settings.dryRun) {
      showToast({
        style: Toast.Style.Success,
        title: 'Dry Run',
        message: JSON.stringify(response, null, 2).slice(0, 200),
      });
      return;
    }

    applyAIResultToForm(response, ctx, settings);
  });
}

export async function handleAIImprove(ctx: Omit<AIActionContext, 'draftText'>): Promise<void> {
  await withAIErrorHandling(async () => {
    const settings = getAISettings();
    const content = buildContentFromFields(ctx.fieldValues, ctx.values);

    if (!content.trim()) {
      showToast({
        style: Toast.Style.Failure,
        title: 'No content',
        message: 'Fill in card fields first',
      });
      return;
    }

    const response = await generateAndParse('improve', content, settings, ctx.selectedTemplate);

    if (settings.dryRun) {
      showToast({
        style: Toast.Style.Success,
        title: 'Dry Run',
        message: JSON.stringify(response, null, 2).slice(0, 200),
      });
      return;
    }

    applyAIResultToForm(response, ctx, settings);
  });
}

export async function handleAIConvert(ctx: AIConvertContext): Promise<void> {
  await withAIErrorHandling(async () => {
    const settings = getAISettings();

    if (ctx.mode === 'basic') {
      settings.noteTypeMode = 'basic_only';
    } else if (ctx.mode === 'cloze') {
      settings.noteTypeMode = 'cloze_only';
    }

    const content = buildContentFromFields(ctx.fieldValues, ctx.values);

    if (!content.trim()) {
      showToast({
        style: Toast.Style.Failure,
        title: 'No content',
        message: 'Fill in card fields first',
      });
      return;
    }

    const response = await generateAndParse(
      'convert',
      content,
      settings,
      ctx.selectedTemplate,
      ctx.mode
    );

    if (settings.dryRun) {
      showToast({
        style: Toast.Style.Success,
        title: 'Dry Run',
        message: JSON.stringify(response, null, 2).slice(0, 200),
      });
      return;
    }

    applyAIResultToForm(response, ctx, settings);
  });
}

export async function generateCardsFromDraft(
  draftText: string,
  count: number,
  template?: AIActionContext['selectedTemplate']
): Promise<AIResponse> {
  const settings = getAISettings();

  if (!settings.apiKey) {
    throw new Error('AI API key not configured');
  }

  return generateAndParse('generate', draftText, settings, template, undefined, count);
}
