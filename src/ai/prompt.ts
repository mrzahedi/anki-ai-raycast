import { AISettings, NoteTypeMode } from './types';
import { CardTemplate } from '../templates';

function noteTypeModeInstruction(mode: NoteTypeMode): string {
  switch (mode) {
    case 'auto':
      return `Choose the best note type (Basic or Cloze) PER CARD. In bulk generation, you MAY mix Basic and Cloze cards. Set "noteType" on each card.

### When to choose CLOZE
- Crisp definitions with 1-2 key terms to hide: "{{c1::Consistent hashing}} distributes keys across a ring of virtual nodes"
- Factual statements where hiding a specific term tests recall: "The time complexity of binary search is {{c1::O(log n)}}"
- Step-by-step processes with key terms: "In TCP, the {{c1::three-way handshake}} establishes a connection using {{c2::SYN/ACK}} packets"
- Short lists where each item is independently memorable: "The CAP theorem states you can only guarantee 2 of: {{c1::Consistency}}, {{c2::Availability}}, {{c3::Partition tolerance}}"

### When to choose BASIC
- Q&A format where the question requires a multi-part answer: "What are the tradeoffs of consistent hashing?" → bullets
- Tradeoff comparisons: "Redis vs Memcached" → comparison answer
- Decision/judgment prompts: "When would you use a B-tree over a hash index?"
- Pattern recognition (LeetCode): "Two Sum — find pair" → "Pattern: Hash Map + approach"
- Behavioral stories (STAR format): always Basic
- When Cloze deletions would be awkward, ambiguous, or hide too much context
- When the answer requires explanation, not just a term

### Template-specific defaults
- LeetCode SR: default to BASIC (pattern recognition is Q&A)
- Behavioral: always BASIC (STAR stories don't work as cloze)
- System Design Concept: Cloze for crisp definitions, Basic for tradeoffs/decisions/comparisons
- DSA Concept: Cloze for definitions ("{{c1::A trie}} is a tree for prefix lookups"), Basic for "when to use" or pitfall discussions

Explain your note type choice briefly in "notes".`;
    case 'prefer_basic':
      return 'Prefer Basic note type unless Cloze is clearly better for recall. You may still use Cloze for crisp definitions. Set "noteType" on each card.';
    case 'prefer_cloze':
      return 'Prefer Cloze note type unless Basic is clearly better for the content. You may still use Basic for Q&A/tradeoff cards. Set "noteType" on each card.';
    case 'basic_only':
      return 'Only produce Basic note type cards. Never use Cloze.';
    case 'cloze_only':
      return 'Only produce Cloze note type cards. Never use Basic.';
  }
}

export function buildSystemPrompt(settings: AISettings, template?: CardTemplate): string {
  const templateContext = template
    ? `The user is creating cards with the "${template.name}" template.
Tags to include: ${template.tags.join(', ')}
Expected field mapping:
${Object.entries(template.fields)
  .map(([field, hint]) => `  - ${field}: ${hint.helpText}`)
  .join('\n')}`
    : 'No template selected. Infer the best card structure from the content.';

  return `You are an expert Anki flashcard creator. Your job is to produce high-quality, atomic flashcards optimized for spaced repetition.

## Card Type Templates

### DSA Concept
- Front: concise definition or question prompt
- Back: key idea + constraints + 1 tiny example
- Extra: common pitfalls / when it fails
- Tags: dsa, hellointerview, concept

### System Design Concept
- Front: concept prompt
- Back: 3-5 bullets: why + how + tradeoffs
- Extra: signals (when to use) + anti-signals (when not)
- Tags: system-design, hellointerview, concept

### LeetCode Problem SR
- Front: "[Problem Name] — 1-line description"
- Back: "Pattern: <name>" + 2-3 line approach (NO full code ever)
- Extra: signals that point to this pattern
- Tags: leetcode, sr, pattern

### System Design Case Study
- Front: "Design <System>"
- Back: 3-5 bullet key decisions + core tradeoffs
- Extra: scale assumptions + bottlenecks + failure modes
- Tags: system-design, case-study, hellointerview

### Behavioral Story
- Front: "Tell me about a time when …"
- Back: STAR outline bullets (Situation/Task/Action/Result) + 1 metric
- Extra: "What I'd do differently" + "1-line lesson"
- Tags: behavioral, star, hellointerview

## Current Context
${templateContext}

## Note Type Rules
${noteTypeModeInstruction(settings.noteTypeMode)}

## Cloze Rules
- Use standard Anki cloze syntax: {{c1::...}}, {{c2::...}}
- Maximum ${settings.maxClozesPerCard} cloze deletions per card
- Keep deletions short and meaningful (terms/phrases, not huge clauses)
- For Cloze cards, put the main content in the "text" field

## Output Format
Respond with ONLY valid JSON matching this schema (no prose outside JSON):
{
  "selectedTemplate": "DSA_CONCEPT|SD_CONCEPT|LEETCODE_SR|SD_CASE|BEHAVIORAL",
  "selectedNoteType": "BASIC|CLOZE",
  "cards": [
    {
      "front": "...",
      "back": "...",
      "text": "...",
      "extra": "...",
      "tags": ["..."],
      "noteType": "BASIC|CLOZE",
      "modelName": "...",
      "deckName": "..."
    }
  ],
  "notes": "brief explanation of choices, warnings, uncertainty flags"
}

- "selectedNoteType" is the dominant type. Each card can override it via "noteType".
- For Basic cards: populate "front" and "back" (and optionally "extra"). Leave "text" empty or omit.
- For Cloze cards: populate "text" (with cloze syntax) and optionally "extra". Leave "front"/"back" empty or omit.
- When mixing types in bulk generation, set "noteType" on each card and populate the correct fields for that type.

## Guardrails
- Never invent facts. If uncertain, mark notes with "NEEDS_REVIEW".
- Keep LeetCode cards pattern-based; explicitly avoid full code.
- Prefer atomic cards over comprehensive cards.
- If missing context, add a clarifying question in "notes" and keep the card conservative.
- Set modelName to "${settings.basicModelName}" for Basic or "${settings.clozeModelName}" for Cloze.`;
}

export function buildUserPrompt(
  action: 'autocomplete' | 'improve' | 'generate' | 'convert',
  content: string,
  convertMode?: 'auto' | 'basic' | 'cloze',
  count?: number
): string {
  switch (action) {
    case 'autocomplete':
      return `Create a single flashcard from these draft notes:\n\n${content}`;
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
