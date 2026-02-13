import { AIResponse, AICard, NoteType, TemplateId } from './types';

const VALID_TEMPLATES: TemplateId[] = [
  'DSA_CONCEPT',
  'SD_CONCEPT',
  'LEETCODE_SR',
  'SD_CASE',
  'BEHAVIORAL',
];
const VALID_NOTE_TYPES: NoteType[] = ['BASIC', 'CLOZE'];

function extractJSON(raw: string): string {
  const trimmed = raw.trim();

  if (trimmed.startsWith('{')) return trimmed;

  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) return fenceMatch[1].trim();

  const braceStart = trimmed.indexOf('{');
  const braceEnd = trimmed.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    return trimmed.slice(braceStart, braceEnd + 1);
  }

  throw new Error('No JSON object found in AI response');
}

function validateCard(card: unknown, index: number): AICard {
  if (!card || typeof card !== 'object') {
    throw new Error(`Card at index ${index} is not an object`);
  }

  const c = card as Record<string, unknown>;

  return {
    front: typeof c.front === 'string' ? c.front : undefined,
    back: typeof c.back === 'string' ? c.back : undefined,
    text: typeof c.text === 'string' ? c.text : undefined,
    extra: typeof c.extra === 'string' ? c.extra : undefined,
    tags: Array.isArray(c.tags) ? c.tags.filter((t): t is string => typeof t === 'string') : [],
    modelName: typeof c.modelName === 'string' ? c.modelName : undefined,
    deckName: typeof c.deckName === 'string' ? c.deckName : undefined,
  };
}

export function parseAIResponse(raw: string): AIResponse {
  const jsonStr = extractJSON(raw);
  const parsed = JSON.parse(jsonStr);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('AI response is not a valid JSON object');
  }

  const obj = parsed as Record<string, unknown>;

  const selectedNoteType = VALID_NOTE_TYPES.includes(obj.selectedNoteType as NoteType)
    ? (obj.selectedNoteType as NoteType)
    : 'BASIC';

  const selectedTemplate = VALID_TEMPLATES.includes(obj.selectedTemplate as TemplateId)
    ? (obj.selectedTemplate as TemplateId)
    : undefined;

  if (!Array.isArray(obj.cards) || obj.cards.length === 0) {
    throw new Error('AI response contains no cards');
  }

  const cards = obj.cards.map((c: unknown, i: number) => validateCard(c, i));

  return {
    selectedTemplate,
    selectedNoteType,
    cards,
    notes: typeof obj.notes === 'string' ? obj.notes : '',
  };
}
