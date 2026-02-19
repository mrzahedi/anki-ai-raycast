import { describe, it, expect } from 'vitest';
import {
  buildScoringSystemPrompt,
  buildScoringUserPrompt,
  buildScoringMessages,
  parseScoreResponse,
} from '../ai/scoring';

describe('buildScoringSystemPrompt', () => {
  it('includes scoring criteria', () => {
    const prompt = buildScoringSystemPrompt();
    expect(prompt).toContain('Atomicity');
    expect(prompt).toContain('Clarity');
    expect(prompt).toContain('Testability');
    expect(prompt).toContain('Cloze Quality');
    expect(prompt).toContain('Difficulty Calibration');
    expect(prompt).toContain('Standalone Context');
  });

  it('includes grading scale', () => {
    const prompt = buildScoringSystemPrompt();
    expect(prompt).toContain('Excellent');
    expect(prompt).toContain('Good');
    expect(prompt).toContain('Needs Work');
    expect(prompt).toContain('Poor');
  });

  it('includes JSON output format', () => {
    const prompt = buildScoringSystemPrompt();
    expect(prompt).toContain('"scores"');
    expect(prompt).toContain('"score"');
    expect(prompt).toContain('"feedback"');
    expect(prompt).toContain('"improvedCard"');
  });
});

describe('buildScoringUserPrompt', () => {
  it('formats a single Basic card', () => {
    const prompt = buildScoringUserPrompt(
      [{ front: 'What is a trie?', back: 'A tree for prefix lookups', tags: ['dsa'] }],
      'BASIC'
    );
    expect(prompt).toContain('1 flashcard');
    expect(prompt).toContain('Card 1 (BASIC)');
    expect(prompt).toContain('Front: What is a trie?');
    expect(prompt).toContain('Back: A tree for prefix lookups');
    expect(prompt).toContain('Tags: dsa');
  });

  it('formats a Cloze card', () => {
    const prompt = buildScoringUserPrompt(
      [{ text: '{{c1::TCP}} uses a handshake', tags: [] }],
      'CLOZE'
    );
    expect(prompt).toContain('Card 1 (CLOZE)');
    expect(prompt).toContain('Text: {{c1::TCP}} uses a handshake');
  });

  it('formats multiple cards', () => {
    const prompt = buildScoringUserPrompt(
      [
        { front: 'Q1', back: 'A1', tags: [] },
        { front: 'Q2', back: 'A2', tags: ['t2'] },
      ],
      'BASIC'
    );
    expect(prompt).toContain('2 flashcard');
    expect(prompt).toContain('Card 1');
    expect(prompt).toContain('Card 2');
  });

  it('uses per-card noteType over global', () => {
    const prompt = buildScoringUserPrompt(
      [{ front: 'Q', back: 'A', tags: [], noteType: 'BASIC' }],
      'CLOZE'
    );
    expect(prompt).toContain('Card 1 (BASIC)');
  });

  it('handles empty fields', () => {
    const prompt = buildScoringUserPrompt([{ tags: [] }], 'BASIC');
    expect(prompt).toContain('Front: (empty)');
    expect(prompt).toContain('Back: (empty)');
  });
});

describe('buildScoringMessages', () => {
  it('returns system and user messages', () => {
    const msgs = buildScoringMessages([{ front: 'Q', back: 'A', tags: [] }], 'BASIC');
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[1].role).toBe('user');
  });
});

describe('parseScoreResponse', () => {
  it('parses a valid scoring response', () => {
    const raw = JSON.stringify({
      scores: [
        {
          score: 8,
          grade: 'Good',
          feedback: ['Clear question', 'Could add extra field'],
          improvedCard: null,
        },
      ],
    });
    const result = parseScoreResponse(raw);
    expect(result.scores).toHaveLength(1);
    expect(result.scores[0].score).toBe(8);
    expect(result.scores[0].grade).toBe('Good');
    expect(result.scores[0].feedback).toEqual(['Clear question', 'Could add extra field']);
    expect(result.scores[0].improvedCard).toBeUndefined();
  });

  it('includes improved card when score < 7', () => {
    const raw = JSON.stringify({
      scores: [
        {
          score: 4,
          feedback: ['Too vague'],
          improvedCard: {
            front: 'Better question',
            back: 'Better answer',
            tags: ['improved'],
          },
        },
      ],
    });
    const result = parseScoreResponse(raw);
    expect(result.scores[0].score).toBe(4);
    expect(result.scores[0].grade).toBe('Poor');
    expect(result.scores[0].improvedCard).toBeDefined();
    expect(result.scores[0].improvedCard?.front).toBe('Better question');
  });

  it('clamps scores to 1-10 range', () => {
    const raw = JSON.stringify({
      scores: [{ score: 15, feedback: ['Over max'] }],
    });
    const result = parseScoreResponse(raw);
    expect(result.scores[0].score).toBe(10);

    const raw2 = JSON.stringify({
      scores: [{ score: -2, feedback: ['Under min'] }],
    });
    const result2 = parseScoreResponse(raw2);
    expect(result2.scores[0].score).toBe(1);
  });

  it('defaults score to 5 when not a number', () => {
    const raw = JSON.stringify({
      scores: [{ score: 'high', feedback: ['ok'] }],
    });
    const result = parseScoreResponse(raw);
    expect(result.scores[0].score).toBe(5);
  });

  it('extracts JSON from fenced code blocks', () => {
    const raw = '```json\n{"scores": [{"score": 9, "feedback": ["Great"]}]}\n```';
    const result = parseScoreResponse(raw);
    expect(result.scores[0].score).toBe(9);
  });

  it('extracts JSON surrounded by prose', () => {
    const raw = 'Here is the score:\n{"scores": [{"score": 7, "feedback": ["Ok"]}]}\nDone!';
    const result = parseScoreResponse(raw);
    expect(result.scores[0].score).toBe(7);
  });

  it('throws on missing scores array', () => {
    expect(() => parseScoreResponse('{"result": "ok"}')).toThrow('missing "scores"');
  });

  it('throws on invalid input', () => {
    expect(() => parseScoreResponse('just text')).toThrow();
    expect(() => parseScoreResponse('')).toThrow();
  });

  it('filters non-string feedback items', () => {
    const raw = JSON.stringify({
      scores: [{ score: 6, feedback: ['Valid', 42, null, 'Also valid'] }],
    });
    const result = parseScoreResponse(raw);
    expect(result.scores[0].feedback).toEqual(['Valid', 'Also valid']);
  });

  it('handles multiple scores', () => {
    const raw = JSON.stringify({
      scores: [
        { score: 9, feedback: ['Excellent'] },
        { score: 5, feedback: ['Needs work'] },
        { score: 3, feedback: ['Poor'], improvedCard: { front: 'Better', back: 'Answer', tags: [] } },
      ],
    });
    const result = parseScoreResponse(raw);
    expect(result.scores).toHaveLength(3);
    expect(result.scores[0].grade).toBe('Excellent');
    expect(result.scores[1].grade).toBe('Needs Work');
    expect(result.scores[2].grade).toBe('Poor');
    expect(result.scores[2].improvedCard?.front).toBe('Better');
  });

  it('does not include improvedCard when score >= 7', () => {
    const raw = JSON.stringify({
      scores: [
        {
          score: 8,
          feedback: ['Good'],
          improvedCard: { front: 'Should be ignored', back: 'Ignored', tags: [] },
        },
      ],
    });
    const result = parseScoreResponse(raw);
    expect(result.scores[0].improvedCard).toBeUndefined();
  });
});
