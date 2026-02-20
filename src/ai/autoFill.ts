import { AISettings, Message, NoteType } from './types';

export interface AutoFillResult {
  deck?: string;
  noteType: NoteType;
  fields: Record<string, string>;
  tags: string[];
  confidence: number;
}

export function buildAutoFillMessages(
  clipboardText: string,
  deckNames: string[],
  noteTypeNames: string[],
  noteTypeFields: Record<string, string[]>,
  existingTags: string[],
  lastUsedDeck?: string,
  lastUsedModel?: string,
  basicModelName?: string,
  clozeModelName?: string
): Message[] {
  const tagSample = existingTags.slice(0, 150).join(', ');

  const systemPrompt = `You are an expert Anki flashcard assistant. Given clipboard content, determine the best deck, note type, card fields, and tags.

## Available Decks
${deckNames.join(', ')}

## Available Note Types and Their Fields
${Object.entries(noteTypeFields)
  .map(([name, fields]) => `- ${name}: ${fields.join(', ')}`)
  .join('\n')}

## Basic Note Type: "${basicModelName || 'Basic'}"
Fields: Front (question), Back (answer), Extra (optional helper), Code (optional snippets), Timestamp/Source (optional source reference)

## Cloze Note Type: "${clozeModelName || 'Cloze'}"
Fields: Text (with {{c1::...}} deletions), Extra (optional), Timestamp (optional)

## Existing Tags (reuse these whenever possible)
${tagSample}

## Tag Rules
- STRONGLY prefer existing tags over creating new ones.
- Use the hierarchical format matching existing patterns (e.g., A::B::Topic::SubTopic).
- Only create a new tag if no existing tag reasonably fits the content.
- Suggest 1-3 tags maximum.

## Context
${lastUsedDeck ? `Last used deck: ${lastUsedDeck}` : 'No recent deck.'}
${lastUsedModel ? `Last used note type: ${lastUsedModel}` : 'No recent note type.'}

## Instructions
Analyze the clipboard content and return JSON:
{
  "deck": "best matching deck name from the list above",
  "noteType": "BASIC or CLOZE",
  "fields": { "Front": "...", "Back": "...", "Extra": "...", "Code": "...", "Timestamp": "..." },
  "tags": ["tag1", "tag2"],
  "confidence": 0.0-1.0
}

- For BASIC: populate "Front" and "Back" at minimum. "Extra", "Code", "Timestamp" only if genuinely useful.
- For CLOZE: populate "Text" with cloze syntax. "Extra" and "Timestamp" only if useful.
- If the clipboard content is not suitable for a flashcard, set confidence to 0 and fill fields with the raw content in Front/Text.
- Pick the deck that best matches the content topic. If unsure, use the last used deck.
- Do NOT invent facts. Use only what's in the clipboard.`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Create a flashcard from this clipboard content:\n\n${clipboardText}` },
  ];
}

export function parseAutoFillResponse(raw: string): AutoFillResult {
  const trimmed = raw.trim();
  let jsonStr = trimmed;

  if (!trimmed.startsWith('{')) {
    const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    } else {
      const braceStart = trimmed.indexOf('{');
      const braceEnd = trimmed.lastIndexOf('}');
      if (braceStart !== -1 && braceEnd > braceStart) {
        jsonStr = trimmed.slice(braceStart, braceEnd + 1);
      } else {
        throw new Error('No JSON in auto-fill response');
      }
    }
  }

  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

  const noteType =
    parsed.noteType === 'CLOZE' ? ('CLOZE' as const) : ('BASIC' as const);

  const fields: Record<string, string> = {};
  if (parsed.fields && typeof parsed.fields === 'object') {
    for (const [k, v] of Object.entries(parsed.fields as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) {
        fields[k] = v;
      }
    }
  }

  const tags: string[] = Array.isArray(parsed.tags)
    ? (parsed.tags as unknown[]).filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    : [];

  return {
    deck: typeof parsed.deck === 'string' ? parsed.deck : undefined,
    noteType,
    fields,
    tags,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
  };
}
