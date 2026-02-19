import { describe, it, expect } from 'vitest';
import {
  combineDeckInfo,
  getCardType,
  getQueueType,
  parseClipboardContent,
} from '../util';
import { DeckStats } from '../types';

describe('combineDeckInfo', () => {
  it('merges deck stats with full deck names', () => {
    const stats: Record<string, DeckStats> = {
      '1': {
        deck_id: 1,
        name: 'Default',
        new_count: 5,
        learn_count: 3,
        review_count: 10,
        total_in_deck: 50,
      },
      '2': {
        deck_id: 2,
        name: 'CS',
        new_count: 0,
        learn_count: 0,
        review_count: 0,
        total_in_deck: 20,
      },
    };
    const deckNames = { 'Default': 1, 'Computer Science::Algorithms': 2 };
    const result = combineDeckInfo(stats, deckNames);

    expect(result).toHaveLength(2);
    const algosDeck = result.find(d => d.deck_id === 2);
    expect(algosDeck?.name).toBe('Computer Science::Algorithms');
  });

  it('falls back to stat name when no matching full name', () => {
    const stats: Record<string, DeckStats> = {
      '99': {
        deck_id: 99,
        name: 'Orphan',
        new_count: 0,
        learn_count: 0,
        review_count: 0,
        total_in_deck: 5,
      },
    };
    const deckNames = { 'Other': 1 };
    const result = combineDeckInfo(stats, deckNames);
    expect(result[0].name).toBe('Orphan');
  });

  it('handles empty inputs', () => {
    expect(combineDeckInfo({}, {})).toEqual([]);
  });
});

describe('getCardType', () => {
  it('returns correct type names', () => {
    expect(getCardType(0)).toBe('New');
    expect(getCardType(1)).toBe('Learning');
    expect(getCardType(2)).toBe('Review');
    expect(getCardType(3)).toBe('Relearning');
  });

  it('returns Unknown for out-of-range values', () => {
    expect(getCardType(4)).toBe('Unknown');
    expect(getCardType(-1)).toBe('Unknown');
    expect(getCardType(999)).toBe('Unknown');
  });
});

describe('getQueueType', () => {
  it('returns correct queue names', () => {
    expect(getQueueType(0)).toBe('New');
    expect(getQueueType(1)).toBe('Learning');
    expect(getQueueType(2)).toBe('Review');
    expect(getQueueType(3)).toBe('Day Learn');
    expect(getQueueType(4)).toBe('Preview');
    expect(getQueueType(5)).toBe('Suspended');
  });

  it('returns Unknown for out-of-range values', () => {
    expect(getQueueType(6)).toBe('Unknown');
    expect(getQueueType(-1)).toBe('Unknown');
  });
});

describe('parseClipboardContent', () => {
  it('parses Q/A format', () => {
    const result = parseClipboardContent('Q: What is a trie?\nA: A tree for prefix lookups');
    expect(result.front).toBe('What is a trie?');
    expect(result.back).toBe('A tree for prefix lookups');
  });

  it('parses Question/Answer format', () => {
    const result = parseClipboardContent('Question: Explain DNS\nAnswer: Domain Name System resolves names to IPs');
    expect(result.front).toBe('Explain DNS');
    expect(result.back).toBe('Domain Name System resolves names to IPs');
  });

  it('parses term: definition format', () => {
    const result = parseClipboardContent('Consistent hashing: A technique for distributing keys across nodes');
    expect(result.front).toBe('Consistent hashing');
    expect(result.back).toBe('A technique for distributing keys across nodes');
  });

  it('splits on blank line separator', () => {
    const result = parseClipboardContent('What is TCP?\n\nTransmission Control Protocol for reliable data transfer');
    expect(result.front).toBe('What is TCP?');
    expect(result.back).toBe('Transmission Control Protocol for reliable data transfer');
  });

  it('splits three blocks into front/back/extra', () => {
    const result = parseClipboardContent('What is TCP?\n\nReliable transport protocol\n\nUses three-way handshake');
    expect(result.front).toBe('What is TCP?');
    expect(result.back).toBe('Reliable transport protocol');
    expect(result.extra).toBe('Uses three-way handshake');
  });

  it('returns raw text when no structure detected', () => {
    const text = 'just some plain text without structure';
    const result = parseClipboardContent(text);
    expect(result.front).toBeUndefined();
    expect(result.back).toBeUndefined();
    expect(result.raw).toBe(text);
  });

  it('handles empty input', () => {
    const result = parseClipboardContent('');
    expect(result.raw).toBe('');
    expect(result.front).toBeUndefined();
  });

  it('handles whitespace-only input', () => {
    const result = parseClipboardContent('   \n   ');
    expect(result.raw).toBe('');
  });

  it('handles case-insensitive Q/A markers', () => {
    const result = parseClipboardContent('q: lower case question\na: lower case answer');
    expect(result.front).toBe('lower case question');
    expect(result.back).toBe('lower case answer');
  });

  it('does not match term:definition for very long terms', () => {
    const longTerm = 'A'.repeat(100) + ': some definition';
    const result = parseClipboardContent(longTerm);
    expect(result.front).toBeUndefined();
  });
});
