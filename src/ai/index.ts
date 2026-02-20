import { getPreferenceValues, showToast, Toast } from '@raycast/api';
import { createGateway, generateText } from 'ai';
import {
  AIActionContext,
  AIConvertContext,
  AISettings,
  AIResponse,
  AICard,
  NoteType,
  AITask,
  DEFAULT_MODEL,
  Message,
  ComprehensiveFillContext,
} from './types';
import { buildSystemPrompt, buildUserPrompt, buildComprehensiveFillPrompt } from './prompt';
import { parseAIResponse } from './parser';
import { mapAICardToAnkiFields } from './fieldMapper';
import { buildScoringMessages, parseScoreResponse, CardScore, gradeFromScore } from './scoring';
import { buildAutoFillMessages, parseAutoFillResponse, AutoFillResult } from './autoFill';
import { detectContentType, getContentTypeLabel } from './contentDetection';

function getAISettings(task: AITask = 'heavy'): AISettings {
  const prefs = getPreferenceValues<Preferences>();

  let model: string;
  if (task === 'light' && prefs.ai_model_light) {
    model = prefs.ai_model_light;
  } else if (task === 'heavy' && prefs.ai_model_heavy) {
    model = prefs.ai_model_heavy;
  } else {
    model = prefs.ai_model || DEFAULT_MODEL;
  }

  return {
    apiKey: prefs.ai_api_key || '',
    model,
    maxOutputTokens: parseInt(prefs.ai_max_output_tokens || '1024', 10),
    temperature: parseFloat(prefs.ai_temperature || '0.3'),
    noteTypeMode: (prefs.ai_note_type_mode || 'auto') as AISettings['noteTypeMode'],
    maxClozesPerCard: parseInt(prefs.ai_max_clozes_per_card || '2', 10),
    dryRun: prefs.ai_dry_run || false,
    basicModelName: prefs.basic_model_name || 'Basic',
    clozeModelName: prefs.cloze_model_name || 'Cloze',
  };
}

async function callAI(messages: Message[], settings: AISettings): Promise<string> {
  const gateway = createGateway({ apiKey: settings.apiKey });
  const { text } = await generateText({
    model: gateway(settings.model),
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    maxOutputTokens: settings.maxOutputTokens,
    temperature: settings.temperature,
  });
  return text;
}

async function generateAndParse(
  action: 'autocomplete' | 'improve' | 'generate' | 'convert',
  content: string,
  settings: AISettings,
  convertMode?: 'auto' | 'basic' | 'cloze',
  count?: number
): Promise<AIResponse> {
  const contentType = detectContentType(content);
  const systemPrompt = buildSystemPrompt(settings, contentType);
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
      title: 'Note Type Incompatibility',
      message: mapping.error,
    });
    return;
  }

  if (ctx.handleModelSwitch && mapping.modelName !== (ctx.values.modelName as string)) {
    ctx.handleModelSwitch(mapping.modelName);
  } else {
    ctx.setValue('modelName', mapping.modelName);
  }

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

async function withAIErrorHandling(fn: () => Promise<void>, task: AITask = 'heavy'): Promise<void> {
  const settings = getAISettings(task);

  if (!settings.apiKey) {
    showToast({
      style: Toast.Style.Failure,
      title: 'AI API key not configured',
      message: 'Set your Vercel AI Gateway key in Preferences → Anki',
    });
    return;
  }

  try {
    await showToast({ style: Toast.Style.Animated, title: 'AI is thinking...' });
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('AI error:', error);

    if (message.includes('API error') || message.includes('401') || message.includes('403')) {
      showToast({
        style: Toast.Style.Failure,
        title: 'AI request failed',
        message: 'Check your Vercel AI Gateway API key and network connection',
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

export async function handleComprehensiveFill(ctx: ComprehensiveFillContext): Promise<void> {
  await withAIErrorHandling(async () => {
    const settings = getAISettings('heavy');
    const sourceText = ctx.sourceText.trim();

    if (!sourceText) {
      showToast({
        style: Toast.Style.Failure,
        title: 'No source material',
        message: 'Paste content into the AI Source Material field first',
      });
      return;
    }

    const contentType = detectContentType(sourceText);
    const contentLabel = getContentTypeLabel(contentType);
    await showToast({ style: Toast.Style.Animated, title: `AI: Detected ${contentLabel}...` });

    const deckNames = ctx.decks.map(d => d.name);
    const existingTags = ctx.availableTags;

    const systemPrompt = buildComprehensiveFillPrompt(
      settings,
      contentType,
      deckNames,
      existingTags,
      ctx.defaultDeck
    );

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Create a single flashcard from this source material:\n\n${sourceText}`,
      },
    ];

    const raw = await callAI(messages, settings);
    const response = parseAIResponse(raw);

    if (settings.dryRun) {
      showToast({
        style: Toast.Style.Success,
        title: 'Dry Run',
        message: JSON.stringify(response, null, 2).slice(0, 200),
      });
      return;
    }

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
        title: 'Note Type Incompatibility',
        message: mapping.error,
      });
      return;
    }

    ctx.handleModelSwitch(mapping.modelName);

    const newFieldValues: Record<string, string> = {};
    for (const [fieldName, fieldValue] of Object.entries(mapping.fields)) {
      newFieldValues[`field_${fieldName}`] = fieldValue;
    }
    ctx.setFieldValues(prev => ({ ...prev, ...newFieldValues }));

    if (response.deck && deckNames.includes(response.deck)) {
      ctx.setValue('deckName', response.deck);
    }

    const allSuggestedTags: string[] = [];
    if (card.tags && card.tags.length > 0) {
      allSuggestedTags.push(...card.tags);
    }
    if (allSuggestedTags.length > 0) {
      const currentTags = (ctx.values.tags as string[]) || [];
      const merged = [...new Set([...currentTags, ...allSuggestedTags])];
      ctx.setValue('tags', merged);
      ctx.setSuggestedTags(prev => [...new Set([...prev, ...allSuggestedTags])]);
    }

    if (response.score) {
      ctx.setQualityScore(response.score);
      ctx.setLastScoreResult({
        score: response.score,
        grade: gradeFromScore(response.score),
        feedback: response.scoreFeedback || ['Score generated during AI fill'],
      });
    }

    const scorePart = response.score ? ` · Score: ${response.score}/10` : '';
    showToast({
      style: Toast.Style.Success,
      title: `AI: ${contentLabel} → ${response.selectedNoteType}${scorePart}`,
      message: response.notes?.slice(0, 100) || 'Card filled successfully',
    });
  }, 'heavy');
}

export async function handleAIAutocomplete(ctx: AIActionContext): Promise<void> {
  await withAIErrorHandling(async () => {
    const settings = getAISettings('heavy');
    const content = ctx.draftText || buildContentFromFields(ctx.fieldValues, ctx.values);

    if (!content.trim()) {
      showToast({
        style: Toast.Style.Failure,
        title: 'No content',
        message: 'Enter source notes or field content first',
      });
      return;
    }

    const response = await generateAndParse('autocomplete', content, settings);

    if (settings.dryRun) {
      showToast({
        style: Toast.Style.Success,
        title: 'Dry Run',
        message: JSON.stringify(response, null, 2).slice(0, 200),
      });
      return;
    }

    applyAIResultToForm(response, ctx, settings);
  }, 'heavy');
}

export async function handleAIImprove(ctx: Omit<AIActionContext, 'draftText'>): Promise<void> {
  await withAIErrorHandling(async () => {
    const settings = getAISettings('heavy');
    const content = buildContentFromFields(ctx.fieldValues, ctx.values);

    if (!content.trim()) {
      showToast({
        style: Toast.Style.Failure,
        title: 'No content',
        message: 'Fill in card fields first',
      });
      return;
    }

    const response = await generateAndParse('improve', content, settings);

    if (settings.dryRun) {
      showToast({
        style: Toast.Style.Success,
        title: 'Dry Run',
        message: JSON.stringify(response, null, 2).slice(0, 200),
      });
      return;
    }

    applyAIResultToForm(response, ctx, settings);
  }, 'heavy');
}

export async function handleAIConvert(ctx: AIConvertContext): Promise<void> {
  await withAIErrorHandling(async () => {
    const settings = getAISettings('heavy');

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

    const response = await generateAndParse('convert', content, settings, ctx.mode);

    if (settings.dryRun) {
      showToast({
        style: Toast.Style.Success,
        title: 'Dry Run',
        message: JSON.stringify(response, null, 2).slice(0, 200),
      });
      return;
    }

    applyAIResultToForm(response, ctx, settings);
  }, 'heavy');
}

export async function generateCardsFromDraft(
  draftText: string,
  count: number
): Promise<AIResponse> {
  const settings = getAISettings('heavy');

  if (!settings.apiKey) {
    throw new Error('AI API key not configured');
  }

  return generateAndParse('generate', draftText, settings, undefined, count);
}

export async function handleAIScore(
  ctx: Omit<AIActionContext, 'draftText'>
): Promise<CardScore | null> {
  let result: CardScore | null = null;

  await withAIErrorHandling(async () => {
    const settings = getAISettings('heavy');
    const content = buildContentFromFields(ctx.fieldValues, ctx.values);

    if (!content.trim()) {
      showToast({
        style: Toast.Style.Failure,
        title: 'No content',
        message: 'Fill in card fields first',
      });
      return;
    }

    const card: AICard = {
      front: ctx.fieldValues['field_Front'] || (ctx.values['field_Front'] as string) || undefined,
      back: ctx.fieldValues['field_Back'] || (ctx.values['field_Back'] as string) || undefined,
      text: ctx.fieldValues['field_Text'] || (ctx.values['field_Text'] as string) || undefined,
      extra: ctx.fieldValues['field_Extra'] || (ctx.values['field_Extra'] as string) || undefined,
      code: ctx.fieldValues['field_Code'] || (ctx.values['field_Code'] as string) || undefined,
      tags: (ctx.values.tags as string[]) || [],
    };

    const messages = buildScoringMessages([card]);
    const raw = await callAI(messages, settings);
    const response = parseScoreResponse(raw);
    result = response.scores[0] || null;

    if (result) {
      const emoji = result.score >= 8 ? '🟢' : result.score >= 5 ? '🟡' : '🔴';
      showToast({
        style: Toast.Style.Success,
        title: `${emoji} Score: ${result.score}/10 — ${result.grade}`,
        message: result.feedback.slice(0, 2).join(' | ').slice(0, 100),
      });
    }
  }, 'heavy');

  return result;
}

export async function scoreCards(cards: AICard[], noteType?: NoteType): Promise<CardScore[]> {
  const settings = getAISettings('heavy');
  if (!settings.apiKey) throw new Error('AI API key not configured');

  const messages = buildScoringMessages(cards, noteType);
  const raw = await callAI(messages, settings);
  const response = parseScoreResponse(raw);
  return response.scores;
}

export async function scoreSingleCard(card: AICard, noteType?: NoteType): Promise<CardScore> {
  const settings = getAISettings('heavy');
  if (!settings.apiKey) throw new Error('AI API key not configured');

  await showToast({ style: Toast.Style.Animated, title: 'Scoring card quality...' });

  const messages = buildScoringMessages([card], noteType);
  const raw = await callAI(messages, settings);
  const response = parseScoreResponse(raw);
  const score = response.scores[0];
  if (!score) throw new Error('AI scoring returned no score');

  const emoji = score.score >= 8 ? '🟢' : score.score >= 5 ? '🟡' : '🔴';
  showToast({
    style: Toast.Style.Success,
    title: `${emoji} Score: ${score.score}/10 — ${score.grade}`,
    message: score.feedback.slice(0, 2).join(' | ').slice(0, 100),
  });

  return score;
}

export async function handleAISuggestTags(
  ctx: Omit<AIActionContext, 'draftText'> & {
    setSuggestedTags?: React.Dispatch<React.SetStateAction<string[]>>;
  }
): Promise<void> {
  await withAIErrorHandling(async () => {
    const settings = getAISettings('light');
    const content = buildContentFromFields(ctx.fieldValues, ctx.values);

    if (!content.trim()) {
      showToast({
        style: Toast.Style.Failure,
        title: 'No content',
        message: 'Fill in card fields first',
      });
      return;
    }

    const existingTags = ctx.availableTags;
    const tagContext =
      existingTags && existingTags.length > 0
        ? `\n\nExisting tags to prefer (reuse these over creating new ones):\n${existingTags.slice(0, 150).join(', ')}`
        : '';

    const messages: Message[] = [
      {
        role: 'system',
        content: `You are a flashcard organization expert. Given flashcard content, suggest 1-3 relevant tags.

CRITICAL RULES:
- STRONGLY prefer reusing existing tags from the list below over creating new ones.
- Match the hierarchical format of existing tags (e.g., A::B::Topic::SubTopic).
- Only create a new tag if absolutely no existing tag fits.
- Keep it to 1-3 tags. Fewer is better.
- Respond with ONLY a JSON array of tag strings.${tagContext}`,
      },
      {
        role: 'user',
        content: `Suggest tags for this flashcard:\n\n${content}`,
      },
    ];

    const raw = await callAI(messages, settings);
    const trimmed = raw.trim();
    const match = trimmed.match(/\[[\s\S]*\]/);
    if (!match) {
      showToast({ style: Toast.Style.Failure, title: 'Could not parse tag suggestions' });
      return;
    }

    const suggested: string[] = JSON.parse(match[0]).filter(
      (t: unknown): t is string => typeof t === 'string' && t.trim().length > 0
    );

    if (ctx.setSuggestedTags) {
      ctx.setSuggestedTags(prev => [...new Set([...prev, ...suggested])]);
    }

    const currentTags = (ctx.values.tags as string[]) || [];
    const merged = [...new Set([...currentTags, ...suggested])];
    ctx.setValue('tags', merged);

    showToast({
      style: Toast.Style.Success,
      title: `Added ${suggested.length} tag${suggested.length !== 1 ? 's' : ''}`,
      message: suggested.join(', ').slice(0, 80),
    });
  }, 'light');
}

export async function handleAutoFill(
  clipboardText: string,
  deckNames: string[],
  noteTypeNames: string[],
  noteTypeFields: Record<string, string[]>,
  existingTags: string[],
  lastUsedDeck?: string,
  lastUsedModel?: string
): Promise<AutoFillResult | null> {
  const settings = getAISettings('light');

  if (!settings.apiKey) return null;

  try {
    await showToast({ style: Toast.Style.Animated, title: 'AI analyzing clipboard...' });

    const messages = buildAutoFillMessages(
      clipboardText,
      deckNames,
      noteTypeNames,
      noteTypeFields,
      existingTags,
      lastUsedDeck,
      lastUsedModel,
      settings.basicModelName,
      settings.clozeModelName
    );

    const raw = await callAI(messages, settings);
    const result = parseAutoFillResponse(raw);

    if (result.confidence > 0) {
      showToast({
        style: Toast.Style.Success,
        title: 'AI auto-filled from clipboard',
        message: `${result.noteType} card · ${result.tags.length} tag${result.tags.length !== 1 ? 's' : ''}`,
      });
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('AI auto-fill failed:', error);
    await showToast({
      style: Toast.Style.Failure,
      title: 'AI auto-fill failed',
      message: message.slice(0, 120),
    });
    return null;
  }
}
