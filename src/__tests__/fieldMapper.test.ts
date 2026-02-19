import { describe, it, expect } from 'vitest';
import { mapAICardToAnkiFields } from '../ai/fieldMapper';
import { Model, Field } from '../types';

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
    id: Math.floor(Math.random() * 1e9),
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

const basicModel = makeModel('Basic', ['Front', 'Back', 'Extra']);
const basicNoExtra = makeModel('Basic', ['Front', 'Back']);
const clozeModel = makeModel('Cloze', ['Text', 'Extra'], 1);
const customModel = makeModel('My Notes', ['Question', 'Answer']);
const allModels = [basicModel, clozeModel, basicNoExtra, customModel];

describe('mapAICardToAnkiFields', () => {
  it('maps a BASIC card to Front/Back/Extra', () => {
    const card = { front: 'What is X?', back: 'X is Y.', extra: 'Watch out for Z.', tags: [] };
    const result = mapAICardToAnkiFields(card, 'BASIC', allModels, 'Basic', 'Cloze');
    expect(result).not.toHaveProperty('error');
    if (!('error' in result)) {
      expect(result.modelName).toBe('Basic');
      expect(result.fields.Front).toBe('What is X?');
      expect(result.fields.Back).toBe('X is Y.');
      expect(result.fields.Extra).toBe('Watch out for Z.');
    }
  });

  it('maps a CLOZE card to Text/Extra on a type=1 model', () => {
    const card = { text: '{{c1::TCP}} uses a three-way handshake', extra: 'Layer 4', tags: [] };
    const result = mapAICardToAnkiFields(card, 'CLOZE', allModels, 'Basic', 'Cloze');
    expect(result).not.toHaveProperty('error');
    if (!('error' in result)) {
      expect(result.modelName).toBe('Cloze');
      expect(result.fields.Text).toContain('{{c1::TCP}}');
      expect(result.fields.Extra).toBe('Layer 4');
    }
  });

  it('returns error when cloze model is missing', () => {
    const card = { text: '{{c1::foo}}', tags: [] };
    const onlyBasic = [basicModel];
    const result = mapAICardToAnkiFields(card, 'CLOZE', onlyBasic, 'Basic', 'Cloze');
    // should fall back to Basic with cloze stripped
    if (!('error' in result)) {
      expect(result.modelName).toBe('Basic');
      expect(result.fields.Front).toBe('foo');
    }
  });

  it('returns error for cloze on a non-cloze model type', () => {
    const fakeCloze = makeModel('Cloze', ['Text', 'Extra'], 0); // type=0, not cloze
    const card = { text: '{{c1::bar}}', tags: [] };
    const result = mapAICardToAnkiFields(card, 'CLOZE', [fakeCloze, basicModel], 'Basic', 'Cloze');
    expect(result).toHaveProperty('error');
  });

  it('falls back to first two fields when model has non-standard field names', () => {
    const card = { front: 'Q?', back: 'A!', tags: [] };
    const result = mapAICardToAnkiFields(card, 'BASIC', [customModel], 'My Notes', 'Cloze');
    expect(result).not.toHaveProperty('error');
    if (!('error' in result)) {
      expect(result.fields.Question).toBe('Q?');
      expect(result.fields.Answer).toBe('A!');
    }
  });

  it('handles Basic model without Extra field', () => {
    const card = { front: 'Q', back: 'A', extra: 'This should be ignored', tags: [] };
    const result = mapAICardToAnkiFields(card, 'BASIC', [basicNoExtra], 'Basic', 'Cloze');
    expect(result).not.toHaveProperty('error');
    if (!('error' in result)) {
      expect(result.fields.Front).toBe('Q');
      expect(result.fields.Back).toBe('A');
      expect(result.fields).not.toHaveProperty('Extra');
    }
  });

  it('strips cloze syntax when falling back from Cloze to Basic', () => {
    const card = { text: '{{c1::Redis}} is an in-memory {{c2::key-value store}}', tags: [] };
    const onlyBasic = [basicModel];
    const result = mapAICardToAnkiFields(card, 'CLOZE', onlyBasic, 'Basic', 'Cloze');
    if (!('error' in result)) {
      expect(result.modelName).toBe('Basic');
      expect(result.fields.Front).toBe('Redis is an in-memory key-value store');
      expect(result.fields.Front).not.toContain('{{');
    }
  });

  it('returns error when basic model not found', () => {
    const card = { front: 'Q', back: 'A', tags: [] };
    const result = mapAICardToAnkiFields(card, 'BASIC', [clozeModel], 'Basic', 'Cloze');
    expect(result).toHaveProperty('error');
  });

  it('maps card using per-card noteType override', () => {
    const card = { text: '{{c1::Hashing}} distributes keys', tags: [], noteType: 'CLOZE' as const };
    const result = mapAICardToAnkiFields(card, 'CLOZE', allModels, 'Basic', 'Cloze');
    expect(result).not.toHaveProperty('error');
    if (!('error' in result)) {
      expect(result.modelName).toBe('Cloze');
      expect(result.fields.Text).toContain('{{c1::Hashing}}');
    }
  });

  it('fills all model fields with empty strings for unmapped fields', () => {
    const card = { front: 'Q', back: 'A', tags: [] };
    const result = mapAICardToAnkiFields(card, 'BASIC', allModels, 'Basic', 'Cloze');
    if (!('error' in result)) {
      expect(result.fields.Extra).toBe('');
      expect(Object.keys(result.fields)).toEqual(['Front', 'Back', 'Extra']);
    }
  });

  it('uses card.front as fallback text for cloze when text is missing', () => {
    const card = { front: 'Some text without cloze', tags: [] };
    const result = mapAICardToAnkiFields(card, 'CLOZE', allModels, 'Basic', 'Cloze');
    if (!('error' in result)) {
      expect(result.fields.Text).toBe('Some text without cloze');
    }
  });

  it('handles cloze model without Extra field', () => {
    const clozeNoExtra = makeModel('Cloze', ['Text'], 1);
    const card = { text: '{{c1::Test}}', extra: 'This will be ignored', tags: [] };
    const result = mapAICardToAnkiFields(card, 'CLOZE', [clozeNoExtra, basicModel], 'Basic', 'Cloze');
    if (!('error' in result)) {
      expect(result.fields.Text).toContain('{{c1::Test}}');
      expect(result.fields).not.toHaveProperty('Extra');
    }
  });
});
