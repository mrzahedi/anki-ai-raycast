import { AICard, NoteType } from './types';
import { Model } from '../types';

interface MappingResult {
  modelName: string;
  fields: Record<string, string>;
}

interface MappingError {
  error: string;
}

export function mapAICardToAnkiFields(
  card: AICard,
  noteType: NoteType,
  availableModels: Model[],
  basicModelName: string,
  clozeModelName: string
): MappingResult | MappingError {
  if (noteType === 'CLOZE') {
    return mapClozeCard(card, availableModels, clozeModelName, basicModelName);
  }
  return mapBasicCard(card, availableModels, basicModelName);
}

function mapClozeCard(
  card: AICard,
  models: Model[],
  clozeModelName: string,
  basicFallback: string
): MappingResult | MappingError {
  const clozeModel = models.find(m => m.name === clozeModelName);

  if (!clozeModel) {
    const fallback = mapBasicCardFromCloze(card, models, basicFallback);
    if ('error' in fallback) return fallback;
    return { ...fallback, fields: { ...fallback.fields } };
  }

  if (clozeModel.type !== 1) {
    return {
      error: `Model "${clozeModelName}" is not a Cloze-type model (type=${clozeModel.type})`,
    };
  }

  const fieldNames = clozeModel.flds.map(f => f.name);
  const fields: Record<string, string> = {};

  const textField = fieldNames.find(f => f.toLowerCase() === 'text');
  if (!textField) {
    return {
      error: `Cloze model "${clozeModelName}" has no "Text" field. Fields: ${fieldNames.join(', ')}`,
    };
  }

  fields[textField] = card.text || card.front || '';

  const extraField = fieldNames.find(
    f => f.toLowerCase() === 'extra' || f.toLowerCase() === 'back extra'
  );
  if (extraField && card.extra) {
    fields[extraField] = card.extra;
  }

  const timestampField = fieldNames.find(
    f => f.toLowerCase() === 'timestamp' || f.toLowerCase() === 'timestamp/source'
  );
  if (timestampField && card.timestamp) {
    fields[timestampField] = card.timestamp;
  }

  for (const fn of fieldNames) {
    if (!(fn in fields)) fields[fn] = '';
  }

  return { modelName: clozeModelName, fields };
}

function mapBasicCard(
  card: AICard,
  models: Model[],
  basicModelName: string
): MappingResult | MappingError {
  const basicModel = models.find(m => m.name === basicModelName);

  if (!basicModel) {
    return { error: `Basic model "${basicModelName}" not found in Anki` };
  }

  const fieldNames = basicModel.flds.map(f => f.name);
  const fields: Record<string, string> = {};

  const frontField = fieldNames.find(f => f.toLowerCase() === 'front');
  const backField = fieldNames.find(f => f.toLowerCase() === 'back');

  if (!frontField || !backField) {
    if (fieldNames.length >= 2) {
      fields[fieldNames[0]] = card.front || card.text || '';
      fields[fieldNames[1]] = card.back || '';
    } else {
      return {
        error: `Basic model "${basicModelName}" needs at least 2 fields. Has: ${fieldNames.join(', ')}`,
      };
    }
  } else {
    fields[frontField] = card.front || card.text || '';
    fields[backField] = card.back || '';
  }

  const extraField = fieldNames.find(f => f.toLowerCase() === 'extra');
  if (extraField && card.extra) {
    fields[extraField] = card.extra;
  }

  const codeField = fieldNames.find(f => f.toLowerCase() === 'code');
  if (codeField && card.code) {
    fields[codeField] = card.code;
  }

  const timestampField = fieldNames.find(
    f => f.toLowerCase() === 'timestamp' || f.toLowerCase() === 'timestamp/source'
  );
  if (timestampField && card.timestamp) {
    fields[timestampField] = card.timestamp;
  }

  for (const fn of fieldNames) {
    if (!(fn in fields)) fields[fn] = '';
  }

  return { modelName: basicModelName, fields };
}

function mapBasicCardFromCloze(
  card: AICard,
  models: Model[],
  basicModelName: string
): MappingResult | MappingError {
  const strippedText = (card.text || '').replace(/\{\{c\d+::(.*?)(?:::[^}]*)?\}\}/g, '$1');

  const modifiedCard: AICard = {
    ...card,
    front: card.front || strippedText,
    back: card.back || card.extra || '',
  };

  return mapBasicCard(modifiedCard, models, basicModelName);
}
