import { describe, it, expect } from 'vitest';
import { parseAIResponse } from '../ai/parser';

describe('parseAIResponse', () => {
  const validResponse = JSON.stringify({
    selectedTemplate: 'DSA_CONCEPT',
    selectedNoteType: 'BASIC',
    cards: [
      {
        front: 'What is a trie?',
        back: 'A tree-like data structure for prefix-based lookups. O(m) where m = key length.',
        extra: 'Pitfall: high memory usage for sparse key sets',
        tags: ['dsa', 'concept'],
        modelName: 'Basic',
      },
    ],
    notes: 'Straightforward definition card, Basic is the right fit.',
  });

  it('parses clean JSON correctly', () => {
    const result = parseAIResponse(validResponse);
    expect(result.selectedNoteType).toBe('BASIC');
    expect(result.selectedTemplate).toBe('DSA_CONCEPT');
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].front).toBe('What is a trie?');
    expect(result.cards[0].tags).toEqual(['dsa', 'concept']);
    expect(result.notes).toContain('Basic is the right fit');
  });

  it('extracts JSON from fenced code blocks', () => {
    const wrapped = '```json\n' + validResponse + '\n```';
    const result = parseAIResponse(wrapped);
    expect(result.cards).toHaveLength(1);
    expect(result.selectedNoteType).toBe('BASIC');
  });

  it('extracts JSON when surrounded by prose', () => {
    const withProse = 'Here is the card:\n\n' + validResponse + '\n\nHope that helps!';
    const result = parseAIResponse(withProse);
    expect(result.cards[0].front).toBe('What is a trie?');
  });

  it('defaults to BASIC when selectedNoteType is invalid', () => {
    const bad = JSON.stringify({
      selectedNoteType: 'INVALID',
      cards: [{ front: 'x', back: 'y', tags: [] }],
    });
    const result = parseAIResponse(bad);
    expect(result.selectedNoteType).toBe('BASIC');
  });

  it('sets selectedTemplate to undefined for unknown template ids', () => {
    const bad = JSON.stringify({
      selectedTemplate: 'NOT_A_TEMPLATE',
      selectedNoteType: 'BASIC',
      cards: [{ front: 'x', back: 'y', tags: [] }],
    });
    const result = parseAIResponse(bad);
    expect(result.selectedTemplate).toBeUndefined();
  });

  it('throws when cards array is empty', () => {
    const empty = JSON.stringify({ selectedNoteType: 'BASIC', cards: [] });
    expect(() => parseAIResponse(empty)).toThrow('no cards');
  });

  it('throws on completely invalid input', () => {
    expect(() => parseAIResponse('')).toThrow();
    expect(() => parseAIResponse('just some text with no json')).toThrow();
    expect(() => parseAIResponse('null')).toThrow();
  });

  it('handles missing optional card fields gracefully', () => {
    const minimal = JSON.stringify({
      selectedNoteType: 'CLOZE',
      cards: [{ text: '{{c1::TCP}} uses a three-way handshake', tags: [] }],
    });
    const result = parseAIResponse(minimal);
    expect(result.cards[0].front).toBeUndefined();
    expect(result.cards[0].back).toBeUndefined();
    expect(result.cards[0].text).toContain('{{c1::TCP}}');
    expect(result.cards[0].extra).toBeUndefined();
  });

  it('coerces non-string tags to empty array', () => {
    const badTags = JSON.stringify({
      selectedNoteType: 'BASIC',
      cards: [{ front: 'q', back: 'a', tags: [1, null, 'valid'] }],
    });
    const result = parseAIResponse(badTags);
    expect(result.cards[0].tags).toEqual(['valid']);
  });

  it('parses multiple cards', () => {
    const multi = JSON.stringify({
      selectedNoteType: 'BASIC',
      cards: [
        { front: 'Q1', back: 'A1', tags: ['t1'] },
        { front: 'Q2', back: 'A2', tags: ['t2'] },
        { front: 'Q3', back: 'A3', tags: ['t3'] },
      ],
    });
    const result = parseAIResponse(multi);
    expect(result.cards).toHaveLength(3);
    expect(result.cards[2].front).toBe('Q3');
  });

  it('parses per-card noteType field', () => {
    const mixed = JSON.stringify({
      selectedNoteType: 'BASIC',
      cards: [
        { front: 'Q1', back: 'A1', tags: [], noteType: 'BASIC' },
        { text: '{{c1::TCP}}', tags: [], noteType: 'CLOZE' },
      ],
    });
    const result = parseAIResponse(mixed);
    expect(result.cards[0].noteType).toBe('BASIC');
    expect(result.cards[1].noteType).toBe('CLOZE');
  });

  it('sets noteType to undefined for invalid per-card noteType', () => {
    const bad = JSON.stringify({
      selectedNoteType: 'BASIC',
      cards: [{ front: 'Q', back: 'A', tags: [], noteType: 'INVALID' }],
    });
    const result = parseAIResponse(bad);
    expect(result.cards[0].noteType).toBeUndefined();
  });

  it('handles deeply nested JSON in fenced blocks', () => {
    const nested = JSON.stringify({
      selectedNoteType: 'BASIC',
      cards: [
        {
          front: 'Nested: {"key": "value"}',
          back: 'Answer with [brackets] and {braces}',
          tags: ['nested'],
        },
      ],
    });
    const wrapped = '```json\n' + nested + '\n```';
    const result = parseAIResponse(wrapped);
    expect(result.cards[0].front).toContain('Nested');
  });

  it('handles card with deckName and modelName', () => {
    const raw = JSON.stringify({
      selectedNoteType: 'BASIC',
      cards: [
        {
          front: 'Q',
          back: 'A',
          tags: [],
          deckName: 'MyDeck',
          modelName: 'Custom',
        },
      ],
    });
    const result = parseAIResponse(raw);
    expect(result.cards[0].deckName).toBe('MyDeck');
    expect(result.cards[0].modelName).toBe('Custom');
  });

  it('throws when a card is not an object', () => {
    const bad = JSON.stringify({
      selectedNoteType: 'BASIC',
      cards: ['not an object'],
    });
    expect(() => parseAIResponse(bad)).toThrow('not an object');
  });
});
