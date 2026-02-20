import { DeckStats, Model } from '../types';
import type { CardScore } from './scoring';

export const DEFAULT_MODEL = 'google/gemini-2.0-flash';

export type NoteTypeMode = 'auto' | 'prefer_basic' | 'prefer_cloze' | 'basic_only' | 'cloze_only';
export type NoteType = 'BASIC' | 'CLOZE';
export type AITask = 'heavy' | 'light';

export interface AISettings {
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

export interface AICard {
  front?: string;
  back?: string;
  text?: string;
  extra?: string;
  code?: string;
  timestamp?: string;
  tags: string[];
  modelName?: string;
  deckName?: string;
  noteType?: NoteType;
}

export interface AIResponse {
  selectedNoteType: NoteType;
  cards: AICard[];
  notes: string;
  deck?: string;
  score?: number;
  scoreFeedback?: string[];
}

export type FormValueSetter = (id: string, value: string | string[]) => void;

export interface AIActionContext {
  draftText?: string;
  fieldValues: Record<string, string>;
  setFieldValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  values: Record<string, unknown>;
  setValue: FormValueSetter;
  models: Model[];
  availableTags?: string[];
  handleModelSwitch?: (modelName: string) => void;
}

export interface AIConvertContext extends AIActionContext {
  mode: 'auto' | 'basic' | 'cloze';
}

export interface ComprehensiveFillContext {
  sourceText: string;
  fieldValues: Record<string, string>;
  setFieldValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  values: Record<string, unknown>;
  setValue: FormValueSetter;
  models: Model[];
  decks: DeckStats[];
  availableTags: string[];
  defaultDeck?: string;
  handleModelSwitch: (modelName: string) => void;
  setSuggestedTags: React.Dispatch<React.SetStateAction<string[]>>;
  setQualityScore: React.Dispatch<React.SetStateAction<number>>;
  setLastScoreResult: React.Dispatch<React.SetStateAction<CardScore | null>>;
}
