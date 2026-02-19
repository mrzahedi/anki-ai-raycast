import { AICard, AISettings, NoteType, Message } from './types';

export interface CardScore {
  score: number;
  grade: 'Excellent' | 'Good' | 'Needs Work' | 'Poor';
  feedback: string[];
  improvedCard?: AICard;
}

export interface ScoreResponse {
  scores: CardScore[];
}

export function buildScoringSystemPrompt(): string {
  return `You are an expert spaced-repetition flashcard reviewer. Score each flashcard on a 1-10 scale based on these criteria:

## Scoring Criteria

1. **Atomicity (0-2 pts)**: Does the card test exactly ONE idea? Deduct if it combines multiple concepts.
2. **Clarity (0-2 pts)**: Is the question/cloze unambiguous? Could a knowledgeable person answer confidently without guessing what's being asked?
3. **Testability (0-2 pts)**: Can you clearly judge whether you know the answer? Avoid vague prompts like "Explain X" — prefer "What is X?" or precise cloze deletions.
4. **Cloze Quality (0-1 pt)**: For Cloze cards only — are deletions meaningful terms (not filler words), short, and independently answerable? For Basic cards, award 1 pt if Q/A format is well-structured.
5. **Difficulty Calibration (0-1 pt)**: Is it neither trivially obvious nor impossibly hard without the card?
6. **Standalone Context (0-2 pts)**: Does the card make sense without external context? Deduct for orphan references like "this algorithm" without naming it.

## Grading
- 9-10: Excellent — textbook-quality card
- 7-8: Good — minor improvements possible
- 5-6: Needs Work — has clear issues that hurt recall
- 1-4: Poor — should be rewritten

## Output Format
Respond with ONLY valid JSON:
{
  "scores": [
    {
      "score": 8,
      "grade": "Good",
      "feedback": ["Clear atomic question", "Back could be more concise"],
      "improvedCard": null
    }
  ]
}

- If score < 7, include an "improvedCard" object with the suggested rewrite (same fields as input: front, back, text, extra, tags, noteType).
- If score >= 7, set "improvedCard" to null.
- Provide 2-4 specific, actionable feedback items per card.
- feedback should include both strengths and weaknesses.`;
}

export function buildScoringUserPrompt(cards: AICard[], noteType?: NoteType): string {
  const cardDescriptions = cards.map((card, i) => {
    const type = card.noteType || noteType || 'BASIC';
    const fields =
      type === 'CLOZE'
        ? `Text: ${card.text || '(empty)'}\nExtra: ${card.extra || '(none)'}`
        : `Front: ${card.front || '(empty)'}\nBack: ${card.back || '(empty)'}\nExtra: ${card.extra || '(none)'}`;
    return `### Card ${i + 1} (${type})\n${fields}\nTags: ${(card.tags || []).join(', ') || '(none)'}`;
  });

  return `Score the following ${cards.length} flashcard(s):\n\n${cardDescriptions.join('\n\n')}`;
}

export function buildScoringMessages(cards: AICard[], noteType?: NoteType): Message[] {
  return [
    { role: 'system', content: buildScoringSystemPrompt() },
    { role: 'user', content: buildScoringUserPrompt(cards, noteType) },
  ];
}

function gradeFromScore(score: number): CardScore['grade'] {
  if (score >= 9) return 'Excellent';
  if (score >= 7) return 'Good';
  if (score >= 5) return 'Needs Work';
  return 'Poor';
}

function validateImprovedCard(card: unknown): AICard | undefined {
  if (!card || typeof card !== 'object') return undefined;
  const c = card as Record<string, unknown>;
  return {
    front: typeof c.front === 'string' ? c.front : undefined,
    back: typeof c.back === 'string' ? c.back : undefined,
    text: typeof c.text === 'string' ? c.text : undefined,
    extra: typeof c.extra === 'string' ? c.extra : undefined,
    tags: Array.isArray(c.tags) ? c.tags.filter((t): t is string => typeof t === 'string') : [],
    noteType:
      c.noteType === 'BASIC' || c.noteType === 'CLOZE' ? (c.noteType as 'BASIC' | 'CLOZE') : undefined,
  };
}

export function parseScoreResponse(raw: string): ScoreResponse {
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
        throw new Error('No JSON object found in scoring response');
      }
    }
  }

  const parsed = JSON.parse(jsonStr);

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.scores)) {
    throw new Error('Scoring response missing "scores" array');
  }

  const scores: CardScore[] = parsed.scores.map((s: Record<string, unknown>, i: number) => {
    const score = typeof s.score === 'number' ? Math.min(10, Math.max(1, Math.round(s.score))) : 5;
    const feedback = Array.isArray(s.feedback)
      ? s.feedback.filter((f: unknown): f is string => typeof f === 'string')
      : [`Card ${i + 1}: no feedback provided`];
    const grade = gradeFromScore(score);
    const improvedCard = score < 7 ? validateImprovedCard(s.improvedCard) : undefined;

    return { score, grade, feedback, improvedCard };
  });

  return { scores };
}
