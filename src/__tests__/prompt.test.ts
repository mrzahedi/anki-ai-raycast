import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt } from '../ai/prompt';
import { AISettings } from '../ai/types';

const baseSettings: AISettings = {
  apiKey: 'test-key',
  model: 'gpt-4o-mini',
  maxOutputTokens: 1024,
  temperature: 0.3,
  noteTypeMode: 'auto',
  maxClozesPerCard: 2,
  dryRun: false,
  basicModelName: 'Basic',
  clozeModelName: 'Cloze',
};

describe('buildSystemPrompt', () => {
  it('includes note type fields for Basic', () => {
    const prompt = buildSystemPrompt(baseSettings);
    expect(prompt).toContain('Front');
    expect(prompt).toContain('Back');
    expect(prompt).toContain('Extra');
    expect(prompt).toContain('Code');
    expect(prompt).toContain('Timestamp');
  });

  it('includes note type fields for Cloze', () => {
    const prompt = buildSystemPrompt(baseSettings);
    expect(prompt).toContain('Text');
    expect(prompt).toContain('cloze');
  });

  it('includes auto mode instructions in auto mode', () => {
    const prompt = buildSystemPrompt({ ...baseSettings, noteTypeMode: 'auto' });
    expect(prompt).toContain('Choose the best note type');
    expect(prompt).toContain('When to choose CLOZE');
    expect(prompt).toContain('When to choose BASIC');
    expect(prompt).toContain('noteType');
  });

  it('includes basic_only instruction', () => {
    const prompt = buildSystemPrompt({ ...baseSettings, noteTypeMode: 'basic_only' });
    expect(prompt).toContain('Only produce Basic');
    expect(prompt).toContain('Never use Cloze');
  });

  it('includes cloze_only instruction', () => {
    const prompt = buildSystemPrompt({ ...baseSettings, noteTypeMode: 'cloze_only' });
    expect(prompt).toContain('Only produce Cloze');
  });

  it('includes max clozes setting', () => {
    const prompt = buildSystemPrompt({ ...baseSettings, maxClozesPerCard: 3 });
    expect(prompt).toContain('Maximum 3 cloze deletions');
  });

  it('includes model names for Basic and Cloze', () => {
    const prompt = buildSystemPrompt({
      ...baseSettings,
      basicModelName: 'MyBasic',
      clozeModelName: 'MyCloze',
    });
    expect(prompt).toContain('"MyBasic"');
    expect(prompt).toContain('"MyCloze"');
  });

  it('includes JSON output schema', () => {
    const prompt = buildSystemPrompt(baseSettings);
    expect(prompt).toContain('selectedNoteType');
    expect(prompt).toContain('"cards"');
    expect(prompt).toContain('NEEDS_REVIEW');
  });
});

describe('buildUserPrompt', () => {
  it('builds autocomplete prompt', () => {
    const prompt = buildUserPrompt('autocomplete', 'some draft notes');
    expect(prompt).toContain('single flashcard');
    expect(prompt).toContain('some draft notes');
  });

  it('builds improve prompt', () => {
    const prompt = buildUserPrompt('improve', 'Front: x\nBack: y');
    expect(prompt).toContain('Improve and atomicize');
    expect(prompt).toContain('Front: x');
  });

  it('builds generate prompt with count', () => {
    const prompt = buildUserPrompt('generate', 'big wall of notes', undefined, 8);
    expect(prompt).toContain('Generate 8');
    expect(prompt).toContain('big wall of notes');
  });

  it('builds convert prompt for auto mode', () => {
    const prompt = buildUserPrompt('convert', 'content here', 'auto');
    expect(prompt).toContain('best note type');
  });

  it('builds convert prompt for explicit cloze', () => {
    const prompt = buildUserPrompt('convert', 'content here', 'cloze');
    expect(prompt).toContain('Cloze');
    expect(prompt).not.toContain('best note type');
  });

  it('builds convert prompt for explicit basic', () => {
    const prompt = buildUserPrompt('convert', 'content here', 'basic');
    expect(prompt).toContain('Basic');
    expect(prompt).not.toContain('best note type');
  });
});
