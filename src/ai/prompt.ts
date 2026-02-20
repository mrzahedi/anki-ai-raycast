import { AISettings, NoteTypeMode } from './types';
import { ContentType, getContentTypePromptEnhancement } from './contentDetection';

function noteTypeModeInstruction(mode: NoteTypeMode): string {
  switch (mode) {
    case 'auto':
      return `Choose the best note type (Basic or Cloze) based on the content. Set "noteType" on each card.

### When to choose CLOZE
- Crisp definitions with 1-2 key terms to hide
- Factual statements where hiding a specific term tests recall
- Step-by-step processes with key terms
- Short lists where each item is independently memorable

### When to choose BASIC
- Q&A format where the question requires a multi-part answer
- Tradeoff comparisons or decision/judgment prompts
- Pattern recognition (e.g., LeetCode problems)
- When Cloze deletions would be awkward, ambiguous, or hide too much context
- When the answer requires explanation, not just a term

Explain your note type choice briefly in "notes".`;
    case 'prefer_basic':
      return 'Prefer Basic note type unless Cloze is clearly better for recall. Set "noteType" on each card.';
    case 'prefer_cloze':
      return 'Prefer Cloze note type unless Basic is clearly better. Set "noteType" on each card.';
    case 'basic_only':
      return 'Only produce Basic note type cards. Never use Cloze.';
    case 'cloze_only':
      return 'Only produce Cloze note type cards. Never use Basic.';
  }
}

export function buildSystemPrompt(settings: AISettings, contentType?: ContentType): string {
  const contentTypeSection = contentType
    ? `\n\n${getContentTypePromptEnhancement(contentType)}\n`
    : '';

  return `You are an expert Anki flashcard creator. Your job is to produce high-quality, atomic flashcards optimized for spaced repetition.

## Note Types Available

### Basic (model: "${settings.basicModelName}")
Fields:
- **Front** (required): The question or prompt
- **Back** (required): The answer
- **Extra** (optional): Helper content — pitfalls, rules of thumb, edge cases, mnemonics, tiny examples, interview recognition tips
- **Code** (optional): Code/pseudocode, commands, schemas, queries. Only include when it truly helps. Keep short.
- **Timestamp/Source** (optional): Source pointer (e.g., "CS50 W2 12:34", "LeetCode #42"). Leave blank if unknown.

Most Basic cards only need Front + Back. Use Extra/Code/Timestamp only when they add real value.

### Cloze (model: "${settings.clozeModelName}")
Fields:
- **Text** (required): The statement with cloze deletions using {{c1::...}} syntax
- **Extra** (optional): Same as Basic Extra — pitfalls, extra context, mini examples
- **Timestamp** (optional): Same as Basic Timestamp/Source

Most Cloze notes only need Text.

## Note Type Rules
${noteTypeModeInstruction(settings.noteTypeMode)}

## Cloze Rules
- Use standard Anki cloze syntax: {{c1::...}}, {{c2::...}}
- Maximum ${settings.maxClozesPerCard} cloze deletions per card
- Keep deletions short and meaningful (terms/phrases, not huge clauses)
${contentTypeSection}
## Output Format
Respond with ONLY valid JSON matching this schema (no prose outside JSON):
{
  "selectedNoteType": "BASIC|CLOZE",
  "cards": [
    {
      "front": "...",
      "back": "...",
      "text": "...",
      "extra": "...",
      "code": "...",
      "timestamp": "...",
      "tags": ["..."],
      "noteType": "BASIC|CLOZE",
      "modelName": "..."
    }
  ],
  "notes": "brief explanation of choices"
}

- For Basic cards: populate "front" and "back". Optionally "extra", "code", "timestamp". Leave "text" empty or omit.
- For Cloze cards: populate "text" (with cloze syntax). Optionally "extra", "timestamp". Leave "front"/"back"/"code" empty or omit.
- Set modelName to "${settings.basicModelName}" for Basic or "${settings.clozeModelName}" for Cloze.

## Guardrails
- Never invent facts. If uncertain, mark notes with "NEEDS_REVIEW".
- Prefer atomic cards over comprehensive cards.
- Do NOT force-fill optional fields. Most cards only need Front+Back or Text.
- If missing context, add a clarifying question in "notes" and keep the card conservative.`;
}

export function buildComprehensiveFillPrompt(
  settings: AISettings,
  contentType: ContentType,
  deckNames: string[],
  existingTags: string[],
  lastUsedDeck?: string
): string {
  const tagSample = existingTags.slice(0, 150).join(', ');
  const deckList = deckNames.join(', ');

  return `You are an expert Anki flashcard creator. Your job is to produce a high-quality, atomic flashcard AND choose the best deck, tags, and note type — all in one shot.

## Note Types Available

### Basic (model: "${settings.basicModelName}")
Fields: Front (required), Back (required), Extra (optional), Code (optional), Timestamp/Source (optional)

### Cloze (model: "${settings.clozeModelName}")
Fields: Text (required, with {{c1::...}} syntax), Extra (optional), Timestamp (optional)

## Note Type Rules
${noteTypeModeInstruction(settings.noteTypeMode)}

## Cloze Rules
- Use standard Anki cloze syntax: {{c1::...}}, {{c2::...}}
- Maximum ${settings.maxClozesPerCard} cloze deletions per card

${getContentTypePromptEnhancement(contentType)}

## Available Decks
${deckList}
${lastUsedDeck ? `Last used deck: ${lastUsedDeck}` : ''}

## Existing Tags (STRONGLY prefer reusing these)
${tagSample || '(none yet)'}

## Tag Rules
- STRONGLY prefer existing tags. Match their hierarchical format (e.g., A::B::Topic).
- Only create a new tag if no existing tag reasonably fits.
- Suggest 1-3 tags maximum.

## Quality Scoring
Also score the card you create on a 1-10 scale:
- Atomicity (0-2), Clarity (0-2), Testability (0-2), Format Quality (0-1), Difficulty (0-1), Standalone Context (0-2)

## Output Format
Respond with ONLY valid JSON:
{
  "selectedNoteType": "BASIC|CLOZE",
  "deck": "best matching deck name from the available decks list",
  "cards": [
    {
      "front": "...",
      "back": "...",
      "text": "...",
      "extra": "...",
      "code": "...",
      "timestamp": "...",
      "tags": ["tag1", "tag2"],
      "noteType": "BASIC|CLOZE",
      "modelName": "${settings.basicModelName} or ${settings.clozeModelName}"
    }
  ],
  "score": 8,
  "scoreFeedback": ["strength1", "strength2"],
  "notes": "brief explanation"
}

## Guardrails
- Never invent facts. Mark uncertain items with "NEEDS_REVIEW".
- Prefer atomic cards. One idea per card.
- Do NOT force-fill optional fields.
- Pick the deck that best matches the content topic.`;
}

export function buildUserPrompt(
  action: 'autocomplete' | 'improve' | 'generate' | 'convert',
  content: string,
  convertMode?: 'auto' | 'basic' | 'cloze',
  count?: number
): string {
  switch (action) {
    case 'autocomplete':
      return `Create a single flashcard from these notes:\n\n${content}`;
    case 'improve':
      return `Improve and atomicize this flashcard. If it should be split into multiple atomic cards, do so:\n\n${content}`;
    case 'generate':
      return `Generate ${count || 5} atomic flashcards from these notes:\n\n${content}`;
    case 'convert': {
      const target =
        convertMode === 'auto'
          ? 'the best note type (Basic or Cloze)'
          : convertMode === 'cloze'
            ? 'Cloze'
            : 'Basic';
      return `Convert this flashcard to ${target}:\n\n${content}`;
    }
  }
}
