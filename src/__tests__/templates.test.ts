import { describe, it, expect } from 'vitest';
import { TEMPLATES, getTemplateById } from '../templates';

describe('TEMPLATES', () => {
  it('has exactly 5 templates', () => {
    expect(TEMPLATES).toHaveLength(5);
  });

  const expectedIds = ['DSA_CONCEPT', 'SD_CONCEPT', 'LEETCODE_SR', 'SD_CASE', 'BEHAVIORAL'];

  it.each(expectedIds)('contains template with id "%s"', id => {
    const t = TEMPLATES.find(t => t.id === id);
    expect(t).toBeDefined();
  });

  it('every template has required structure', () => {
    for (const t of TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.tags.length).toBeGreaterThan(0);
      expect(['Basic', 'Cloze']).toContain(t.preferredModel);
      expect(Object.keys(t.fields).length).toBeGreaterThan(0);
    }
  });

  it('every template has at least Front and Back field hints', () => {
    for (const t of TEMPLATES) {
      const fieldKeys = Object.keys(t.fields);
      if (t.preferredModel === 'Basic') {
        expect(fieldKeys).toContain('Front');
        expect(fieldKeys).toContain('Back');
      } else {
        expect(fieldKeys).toContain('Text');
      }
    }
  });

  it('every field hint has placeholder and helpText', () => {
    for (const t of TEMPLATES) {
      for (const [, hint] of Object.entries(t.fields)) {
        expect(hint.placeholder).toBeTruthy();
        expect(hint.helpText).toBeTruthy();
      }
    }
  });
});

describe('getTemplateById', () => {
  it('returns the correct template for valid id', () => {
    const dsa = getTemplateById('DSA_CONCEPT');
    expect(dsa).toBeDefined();
    expect(dsa?.name).toContain('DSA');
  });

  it('returns undefined for unknown id', () => {
    expect(getTemplateById('NONEXISTENT')).toBeUndefined();
    expect(getTemplateById('')).toBeUndefined();
  });
});
