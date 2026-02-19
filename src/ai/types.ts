import { Model } from '../types';
import { CardTemplate } from '../templates';

export type AIProvider = 'openai' | 'anthropic' | 'gemini';
export type NoteTypeMode = 'auto' | 'prefer_basic' | 'prefer_cloze' | 'basic_only' | 'cloze_only';
export type NoteType = 'BASIC' | 'CLOZE';
export type TemplateId = 'DSA_CONCEPT' | 'SD_CONCEPT' | 'LEETCODE_SR' | 'SD_CASE' | 'BEHAVIORAL';

export interface AISettings {
  provider: AIProvider;
  apiKey: string;
  model: string;
  maxOutputTokens: number;
  temperature: number;
  noteTypeMode: NoteTypeMode;
  maxClozesPerCard: number;
  dryRun: boolean;
  basicModelName: string;
  clozeModelName: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIProviderAdapter {
  generate(messages: Message[], settings: AISettings): Promise<string>;
}

export interface AICard {
  front?: string;
  back?: string;
  text?: string;
  extra?: string;
  tags: string[];
  modelName?: string;
  deckName?: string;
  noteType?: NoteType;
}

export interface AIResponse {
  selectedTemplate?: TemplateId;
  selectedNoteType: NoteType;
  cards: AICard[];
  notes: string;
}

export type FormValueSetter = (id: string, value: string | string[]) => void;

export interface AIActionContext {
  draftText?: string;
  fieldValues: Record<string, string>;
  setFieldValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  values: Record<string, unknown>;
  setValue: FormValueSetter;
  models: Model[];
  selectedTemplate?: CardTemplate;
}

export interface AIConvertContext extends AIActionContext {
  mode: 'auto' | 'basic' | 'cloze';
}

export function getDefaultModel(provider: AIProvider): string {
  switch (provider) {
    case 'openai':
      return 'gpt-4o-mini';
    case 'anthropic':
      return 'claude-sonnet-4-20250514';
    case 'gemini':
      return 'gemini-2.0-flash';
  }
}
