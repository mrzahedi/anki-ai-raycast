import { AIResponse, AICard, NoteType } from './types';

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
    code: typeof c.code === 'string' ? c.code : undefined,
    timestamp: typeof c.timestamp === 'string' ? c.timestamp : undefined,
    tags: Array.isArray(c.tags) ? c.tags.filter((t): t is string => typeof t === 'string') : [],
    modelName: typeof c.modelName === 'string' ? c.modelName : undefined,
    deckName: typeof c.deckName === 'string' ? c.deckName : undefined,
    noteType: VALID_NOTE_TYPES.includes(c.noteType as NoteType)
      ? (c.noteType as NoteType)
      : undefined,
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

  if (!Array.isArray(obj.cards) || obj.cards.length === 0) {
    throw new Error('AI response contains no cards');
  }

  const cards = obj.cards.map((c: unknown, i: number) => validateCard(c, i));

  return {
    selectedNoteType,
    cards,
    notes: typeof obj.notes === 'string' ? obj.notes : '',
  };
}
