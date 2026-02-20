import { describe, it, expect } from 'vitest';
import { parseAIResponse } from '../ai/parser';
import { mapAICardToAnkiFields } from '../ai/fieldMapper';
import { buildSystemPrompt, buildUserPrompt } from '../ai/prompt';
import { AISettings } from '../ai/types';
import { Model, Field } from '../types';

// -- helpers --

function makeField(name: string, ord: number): Field {
  return {
    name,
    ord,
    collapsed: false,
    description: '',
    excludeFromSearch: false,
    font: 'Arial',
    id: ord,
    plainText: false,
    preventDeletion: false,
    rtl: false,
    size: 20,
    sticky: false,
    tag: null,
  };
}

function makeModel(name: string, fields: string[], type = 0): Model {
  return {
    name,
    id: Date.now(),
    type,
    flds: fields.map((f, i) => makeField(f, i)),
    css: '',
    did: null,
    latexPost: '',
    latexPre: '',
    latexsvg: false,
    mod: 0,
    originalStockKind: 0,
    req: [],
    sortf: 0,
    tmpls: [],
    usn: 0,
  };
}

const basicModel = makeModel('Basic', ['Front', 'Back', 'Extra', 'Code', 'Timestamp/Source']);
const clozeModel = makeModel('Cloze', ['Text', 'Extra', 'Timestamp'], 1);

const baseSettings: AISettings = {
  apiKey: 'k',
  model: 'm',
  maxOutputTokens: 1024,
  temperature: 0.3,
  noteTypeMode: 'auto',
  maxClozesPerCard: 2,
  dryRun: false,
  basicModelName: 'Basic',
  clozeModelName: 'Cloze',
};

// -- integration: parse -> map --

describe('AI pipeline: parse -> map (Basic)', () => {
  const mockApiResponse = JSON.stringify({
    selectedNoteType: 'BASIC',
    cards: [
      {
        front: 'Two Sum — find two numbers adding to target',
        back: 'Pattern: Hash Map\n1. Iterate, check complement\n2. Store num→index',
        extra: 'Signals: "find pair", unsorted array',
        tags: ['leetcode', 'sr'],
        modelName: 'Basic',
      },
    ],
    notes: 'Classic hash map pattern, Basic fits best.',
  });

  it('produces Anki-ready fields from a raw API response', () => {
    const parsed = parseAIResponse(mockApiResponse);
    const mapped = mapAICardToAnkiFields(
      parsed.cards[0],
      parsed.selectedNoteType,
      [basicModel, clozeModel],
      'Basic',
      'Cloze'
    );

    expect(mapped).not.toHaveProperty('error');
    if (!('error' in mapped)) {
      expect(mapped.modelName).toBe('Basic');
      expect(mapped.fields.Front).toContain('Two Sum');
      expect(mapped.fields.Back).toContain('Hash Map');
      expect(mapped.fields.Extra).toContain('Signals');
    }
  });
});

describe('AI pipeline: parse -> map (Cloze)', () => {
  const mockApiResponse = JSON.stringify({
    selectedNoteType: 'CLOZE',
    cards: [
      {
        text: '{{c1::Consistent hashing}} distributes keys across a ring of {{c2::virtual nodes}}',
        extra: 'Used in distributed caches and databases',
        tags: ['system-design', 'concept'],
        modelName: 'Cloze',
      },
    ],
    notes: 'Cloze works well for crisp definitions.',
  });

  it('produces Anki-ready fields for a Cloze card', () => {
    const parsed = parseAIResponse(mockApiResponse);
    const mapped = mapAICardToAnkiFields(
      parsed.cards[0],
      parsed.selectedNoteType,
      [basicModel, clozeModel],
      'Basic',
      'Cloze'
    );

    expect(mapped).not.toHaveProperty('error');
    if (!('error' in mapped)) {
      expect(mapped.modelName).toBe('Cloze');
      expect(mapped.fields.Text).toContain('{{c1::');
      expect(mapped.fields.Extra).toContain('distributed caches');
    }
  });
});

describe('AI pipeline: cloze fallback to basic', () => {
  const mockClozeResponse = JSON.stringify({
    selectedNoteType: 'CLOZE',
    cards: [
      {
        text: '{{c1::CAP theorem}} states you can only have 2 of 3: consistency, availability, partition tolerance',
        tags: ['system-design'],
      },
    ],
    notes: '',
  });

  it('falls back to Basic and strips cloze syntax when cloze model unavailable', () => {
    const parsed = parseAIResponse(mockClozeResponse);
    const mapped = mapAICardToAnkiFields(
      parsed.cards[0],
      parsed.selectedNoteType,
      [basicModel],
      'Basic',
      'Cloze'
    );

    expect(mapped).not.toHaveProperty('error');
    if (!('error' in mapped)) {
      expect(mapped.modelName).toBe('Basic');
      expect(mapped.fields.Front).toContain('CAP theorem');
      expect(mapped.fields.Front).not.toContain('{{c1::');
    }
  });
});

describe('AI pipeline: multi-card generation', () => {
  const mockMultiResponse = JSON.stringify({
    selectedNoteType: 'BASIC',
    cards: [
      { front: 'Q1', back: 'A1', tags: ['t1'] },
      { front: 'Q2', back: 'A2', extra: 'E2', tags: ['t2'] },
      { front: 'Q3', back: 'A3', tags: ['t3'] },
    ],
    notes: 'Generated 3 cards.',
  });

  it('parses and maps all cards in the array', () => {
    const parsed = parseAIResponse(mockMultiResponse);
    expect(parsed.cards).toHaveLength(3);

    for (const card of parsed.cards) {
      const mapped = mapAICardToAnkiFields(
        card,
        parsed.selectedNoteType,
        [basicModel, clozeModel],
        'Basic',
        'Cloze'
      );
      expect(mapped).not.toHaveProperty('error');
    }
  });
});

describe('prompt includes note type fields', () => {
  it('includes Basic note type fields in system prompt', () => {
    const system = buildSystemPrompt(baseSettings);
    expect(system).toContain('Front');
    expect(system).toContain('Back');
    expect(system).toContain('Extra');
    expect(system).toContain('Code');
    expect(system).toContain('Timestamp');
  });

  it('includes Cloze note type fields in system prompt', () => {
    const system = buildSystemPrompt(baseSettings);
    expect(system).toContain('Text');
  });

  it('builds user prompt for autocomplete', () => {
    const user = buildUserPrompt('autocomplete', 'sample notes');
    expect(user).toContain('sample notes');
  });
});
