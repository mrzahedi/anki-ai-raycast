import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Form,
  getPreferenceValues,
  showToast,
  Toast,
  useNavigation,
} from '@raycast/api';
import noteActions from '../api/noteActions';
import guiActions from '../api/guiActions';
import { useCachedPromise, useForm } from '@raycast/utils';
import deckActions from '../api/deckActions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AddNoteParams, CreateCardFormValues, FieldRef, ShortcutDictionary } from '../types';
import modelActions from '../api/modelActions';
import React from 'react';
import { AICard, NoteType } from '../ai/types';
import { CardScore } from '../ai/scoring';
import { isValidFileType, transformSubmittedData } from '../util';
import useErrorHandling from '../hooks/useErrorHandling';
import { useDefaults } from '../hooks/useDefaults';
import { useDraftPersistence } from '../hooks/useDraftPersistence';

interface Props {
  deckName?: string;
}

interface PreparedSubmission {
  requestBody: AddNoteParams;
  frontText: string;
  deckName: string;
  modelName: string;
  tags: string[];
  scoreCard: AICard;
  noteType: NoteType;
}

function trimToSingleLine(text: string, max = 60): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max);
}

export default function AddCardAction({ deckName }: Props) {
  const { push, pop } = useNavigation();
  const { handleError, errorMarkdown } = useErrorHandling();
  const {
    defaultDeck,
    defaultModel,
    defaultTags,
    isLoading: defaultsLoading,
    persistDefaults,
    persistDeck,
    persistModel,
  } = useDefaults(deckName);

  const {
    data: decks,
    isLoading: decksLoading,
    error: decksError,
  } = useCachedPromise(deckActions.getDecks);
  const {
    data: models,
    isLoading: modelsLoading,
    error: modelsError,
  } = useCachedPromise(modelActions.getModels);
  const {
    data: tags,
    isLoading: tagsLoading,
    error: tagsError,
  } = useCachedPromise(noteActions.getTags);

  const tagsCardRef = useRef<Form.TagPicker>(null);
  const fieldRefs = useRef<Record<string, FieldRef>>({});
  const autoFillAttemptedRef = useRef(false);

  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [draftText, setDraftText] = useState('');
  const [qualityScore, setQualityScore] = useState(0);
  const [addedCount, setAddedCount] = useState(0);

  const { allow_empty_card_fields, enable_attachments, show_draft_field } =
    getPreferenceValues<Preferences.AddCard>();

  const prefs = getPreferenceValues<Preferences>();
  const ai_enabled = prefs.ai_enabled || false;
  const ai_auto_score = prefs.ai_auto_score_on_add !== false;

  const shortcuts = useMemo((): ShortcutDictionary => {
    return {
      clearForm: { modifiers: ['cmd'], key: 'x' },
    };
  }, []);

  const { handleSubmit, values, reset, focus, setValidationError, setValue } =
    useForm<CreateCardFormValues>({
      initialValues: {
        deckName: defaultDeck || deckName || '',
        modelName: defaultModel || '',
        tags: defaultTags,
      },
      onSubmit: async (submittedValues) => {
        const prepared = buildSubmission(submittedValues);
        if (!prepared) return;

        const shouldAutoScore =
          ai_enabled && ai_auto_score && Boolean((prefs.ai_api_key || '').trim());

        if (shouldAutoScore) {
          try {
            await showToast({ style: Toast.Style.Animated, title: 'Scoring card quality...' });
            const { scoreSingleCard } = await import('../ai');
            const scoreResult = await scoreSingleCard(prepared.scoreCard, prepared.noteType);
            setQualityScore(scoreResult.score);

            push(
              <ScoreBeforeAddDetail
                score={scoreResult}
                onApplyImprovement={() => {
                  if (scoreResult.improvedCard) {
                    applyImprovement(scoreResult.improvedCard);
                  }
                }}
                onConfirmAdd={async () => {
                  await addPreparedCard(prepared);
                }}
              />
            );
            return;
          } catch (error) {
            showToast({
              style: Toast.Style.Failure,
              title: 'Scoring failed, adding card directly',
            });
            handleError(error);
          }
        }

        await addPreparedCard(prepared);
      },
    });

  const formSetValue = setValue as (id: string, value: string | string[]) => void;

  const { restoredState, clearSavedDraft } = useDraftPersistence({
    draftText,
    fieldValues,
    deckName: values.deckName,
    modelName: values.modelName,
  });

  useEffect(() => {
    if (!restoredState) return;
    if (restoredState.draftText) setDraftText(restoredState.draftText);
    if (restoredState.fieldValues && Object.keys(restoredState.fieldValues).length > 0) {
      setFieldValues(restoredState.fieldValues);
    }
    if (restoredState.deckName) setValue('deckName', restoredState.deckName);
    if (restoredState.modelName) setValue('modelName', restoredState.modelName);
  }, [restoredState, setValue]);

  useEffect(() => {
    if (!defaultsLoading && defaultDeck && !values.deckName) {
      setValue('deckName', defaultDeck);
    }
    if (!defaultsLoading && defaultModel && !values.modelName) {
      setValue('modelName', defaultModel);
    }
  }, [defaultsLoading, defaultDeck, defaultModel, values.deckName, values.modelName, setValue]);

  useEffect(() => {
    const error = decksError || tagsError || modelsError;
    if (!error) return;
    handleError(error);
  }, [decksError, tagsError, modelsError, handleError]);

  const selectedModel = useMemo(
    () => models?.find(model => model.name === values.modelName),
    [models, values.modelName]
  );

  const hasCardContent = useMemo(() => {
    return Object.entries(fieldValues).some(
      ([key, value]) => key.startsWith('field_') && value.trim().length > 0
    );
  }, [fieldValues]);

  const resolveFieldValue = useCallback(
    (mergedValues: Record<string, unknown>, fieldName: string): string => {
      const raw = mergedValues[`field_${fieldName}`];
      return typeof raw === 'string' ? raw : '';
    },
    []
  );

  const buildSubmission = useCallback(
    (submittedValues: CreateCardFormValues): PreparedSubmission | null => {
      if (!models || modelsLoading || modelsError) return null;

      const model = models.find(m => m.name === submittedValues.modelName);
      if (!model) {
        setValidationError('modelName', 'Choose a note type');
        return null;
      }

      const fieldNames = model.flds.map(f => f.name);
      const mergedValues = { ...submittedValues } as Record<string, unknown>;
      for (const fieldName of fieldNames) {
        const key = `field_${fieldName}`;
        if (fieldValues[key] !== undefined) {
          mergedValues[key] = fieldValues[key];
        }
      }

      if (!allow_empty_card_fields) {
        const requiredFields =
          model.type === 1
            ? [model.flds.find(f => f.name.toLowerCase() === 'text') || model.flds[0]]
            : [
                model.flds.find(f => f.name.toLowerCase() === 'front') || model.flds[0],
                model.flds.find(f => f.name.toLowerCase() === 'back') || model.flds[1],
              ].filter(Boolean);

        for (const requiredField of requiredFields) {
          const value = resolveFieldValue(mergedValues, requiredField.name);
          if (!value.trim()) {
            setValidationError(`field_${requiredField.name}`, `${requiredField.name} is required`);
            return null;
          }
          setValidationError(`field_${requiredField.name}`, undefined);
        }
      }

      const requestBody = transformSubmittedData(
        mergedValues as CreateCardFormValues,
        fieldNames,
        enable_attachments
      );

      const fieldByName = (name: string): string => {
        const field = model.flds.find(f => f.name.toLowerCase() === name.toLowerCase());
        return field ? resolveFieldValue(mergedValues, field.name) : '';
      };
      const timestampField = model.flds.find(f => f.name.toLowerCase().includes('timestamp'));

      const noteType: NoteType = model.type === 1 ? 'CLOZE' : 'BASIC';
      const frontText =
        trimToSingleLine(fieldByName('Front')) ||
        trimToSingleLine(fieldByName('Text')) ||
        trimToSingleLine(resolveFieldValue(mergedValues, fieldNames[0] || ''));

      const scoreCard: AICard = {
        front: fieldByName('Front') || undefined,
        back: fieldByName('Back') || undefined,
        text: fieldByName('Text') || undefined,
        extra: fieldByName('Extra') || undefined,
        code: fieldByName('Code') || undefined,
        timestamp: timestampField ? resolveFieldValue(mergedValues, timestampField.name) : undefined,
        tags: submittedValues.tags || [],
        noteType,
      };

      return {
        requestBody,
        frontText: frontText || '(empty)',
        deckName: submittedValues.deckName,
        modelName: submittedValues.modelName,
        tags: submittedValues.tags || [],
        scoreCard,
        noteType,
      };
    },
    [
      models,
      modelsLoading,
      modelsError,
      fieldValues,
      allow_empty_card_fields,
      resolveFieldValue,
      setValidationError,
      enable_attachments,
    ]
  );

  const applyImprovement = useCallback(
    (card: AICard) => {
      if (!selectedModel) return;

      const nextValues: Record<string, string> = {};
      for (const field of selectedModel.flds) {
        const lower = field.name.toLowerCase();
        if (lower === 'front' && card.front !== undefined) nextValues[`field_${field.name}`] = card.front;
        if (lower === 'back' && card.back !== undefined) nextValues[`field_${field.name}`] = card.back;
        if (lower === 'text' && card.text !== undefined) nextValues[`field_${field.name}`] = card.text;
        if (lower === 'extra' && card.extra !== undefined) nextValues[`field_${field.name}`] = card.extra;
        if (lower === 'code' && card.code !== undefined) nextValues[`field_${field.name}`] = card.code;
        if (lower.includes('timestamp') && card.timestamp !== undefined) {
          nextValues[`field_${field.name}`] = card.timestamp;
        }
      }

      if (Object.keys(nextValues).length > 0) {
        setFieldValues(prev => ({ ...prev, ...nextValues }));
      }

      if (card.tags && card.tags.length > 0) {
        const currentTags = values.tags || [];
        setValue('tags', [...new Set([...currentTags, ...card.tags])]);
      }
    },
    [selectedModel, values.tags, setValue]
  );

  const addPreparedCard = useCallback(
    async (prepared: PreparedSubmission) => {
      try {
        const noteId = await noteActions.addNote(prepared.requestBody);
        const tagSummary = prepared.tags.length > 0 ? ` · ${prepared.tags.slice(0, 2).join(', ')}` : '';

        showToast({
          style: Toast.Style.Success,
          title: `Added: ${trimToSingleLine(prepared.frontText, 50)}`,
          message: `${prepared.deckName}${tagSummary}`.slice(0, 120),
          primaryAction: {
            title: 'Open in Anki',
            onAction: async () => {
              await guiActions.guiBrowse(`nid:${noteId}`);
            },
          },
        });

        setAddedCount(prev => prev + 1);
        await persistDefaults(prepared.deckName, prepared.modelName);
        await clearSavedDraft();
        handleClearForm();
      } catch (error) {
        handleError(error);
      }
    },
    [persistDefaults, clearSavedDraft, handleError]
  );

  const clearModelFields = useCallback(
    (modelName: string | undefined) => {
      if (!models || !modelName) return;
      const model = models.find(m => m.name === modelName);
      if (!model) return;

      for (const field of model.flds) {
        formSetValue(`field_${field.name}`, '');
        setValidationError(`field_${field.name}`, undefined);
        if (enable_attachments) {
          formSetValue(`file_${field.name}`, []);
          setValidationError(`file_${field.name}`, undefined);
        }
      }
    },
    [models, formSetValue, setValidationError, enable_attachments]
  );

  const handleClearForm = useCallback(() => {
    const currentModelName = values.modelName;
    clearModelFields(currentModelName);
    reset();
    setFieldValues({});
    setDraftText('');
    setQualityScore(0);
    setTimeout(() => focus('deckName'), 0);
  }, [clearModelFields, reset, values.modelName, focus]);

  const handleDeckChange = useCallback(
    (nextDeck: string) => {
      setValue('deckName', nextDeck);
      void persistDeck(nextDeck);
    },
    [setValue, persistDeck]
  );

  const handleModelChange = useCallback(
    (nextModel: string) => {
      const previousModel = values.modelName;
      setValue('modelName', nextModel);
      void persistModel(nextModel);
      setQualityScore(0);

      if (previousModel && previousModel !== nextModel) {
        clearModelFields(previousModel);
      }
      setFieldValues({});
    },
    [values.modelName, setValue, persistModel, clearModelFields]
  );

  const handleFileChange = (fieldName: string, files: string[]) => {
    const invalidFiles = files.filter(file => !isValidFileType(file));
    if (invalidFiles.length > 0) {
      setValidationError(
        `file_${fieldName}`,
        `Invalid file type(s): ${invalidFiles.join(', ')}`
      );
    } else {
      setValidationError(`file_${fieldName}`, undefined);
    }
  };

  const handleAIScoreAction = useCallback(async () => {
    const prepared = buildSubmission(values as CreateCardFormValues);
    if (!prepared) return;

    try {
      const { scoreSingleCard } = await import('../ai');
      const scoreResult = await scoreSingleCard(prepared.scoreCard, prepared.noteType);
      setQualityScore(scoreResult.score);
      push(
        <ScoreDetailView
          score={scoreResult}
          hasImprovement={!!scoreResult.improvedCard}
          onApplyImprovement={() => {
            if (scoreResult.improvedCard) applyImprovement(scoreResult.improvedCard);
          }}
        />
      );
    } catch (error) {
      handleError(error);
    }
  }, [buildSubmission, values, push, applyImprovement, handleError]);

  // AI auto-fill from clipboard on open
  useEffect(() => {
    if (autoFillAttemptedRef.current) return;
    if (!ai_enabled || !prefs.ai_api_key) return;
    if (decksLoading || modelsLoading || tagsLoading || !decks || !models || !tags) return;

    const hasExistingData =
      draftText.trim().length > 0 ||
      Object.values(fieldValues).some(v => typeof v === 'string' && v.trim().length > 0);
    if (hasExistingData) return;

    autoFillAttemptedRef.current = true;

    void (async () => {
      try {
        const clipText = (await Clipboard.readText())?.trim() || '';
        if (clipText.length < 10) return;

        const { handleAutoFill } = await import('../ai');
        const deckNames = decks.map(d => d.name);
        const noteTypeNames = models.map(m => m.name);
        const noteTypeFields: Record<string, string[]> = {};
        for (const m of models) {
          noteTypeFields[m.name] = m.flds.map(f => f.name);
        }

        const result = await handleAutoFill(
          clipText,
          deckNames,
          noteTypeNames,
          noteTypeFields,
          tags,
          defaultDeck,
          defaultModel
        );

        if (!result || result.confidence === 0) return;

        if (result.deck && deckNames.includes(result.deck)) {
          setValue('deckName', result.deck);
          void persistDeck(result.deck);
        }

        const basicName = prefs.basic_model_name || 'Basic';
        const clozeName = prefs.cloze_model_name || 'Cloze';
        const targetModel = result.noteType === 'CLOZE' ? clozeName : basicName;
        const matchedModel = models.find(m => m.name === targetModel);
        if (matchedModel) {
          setValue('modelName', matchedModel.name);
          void persistModel(matchedModel.name);
        }

        if (result.fields && Object.keys(result.fields).length > 0) {
          const updates: Record<string, string> = {};
          for (const [key, val] of Object.entries(result.fields)) {
            if (val) updates[`field_${key}`] = val;
          }
          setFieldValues(prev => ({ ...prev, ...updates }));
        }

        if (result.tags && result.tags.length > 0) {
          const currentTags = defaultTags || [];
          const merged = [...new Set([...currentTags, ...result.tags])];
          setValue('tags', merged);
        }
      } catch {
        // Silently ignore auto-fill errors
      }
    })();
  }, [
    ai_enabled,
    decks,
    models,
    tags,
    draftText,
    fieldValues,
    values.deckName,
    values.modelName,
    decksLoading,
    modelsLoading,
    tagsLoading,
  ]);

  const sortedDecks = useMemo(() => {
    if (!decks) return [];
    const lastDeck = defaultDeck;
    if (!lastDeck) return decks;
    const recent = decks.filter(d => d.name === lastDeck);
    const rest = decks.filter(d => d.name !== lastDeck);
    return [...recent, ...rest];
  }, [decks, defaultDeck]);

  const dynamicFields = useMemo(() => {
    if (!selectedModel) return null;
    return (
      <>
        {selectedModel.flds.map(field => {
          const textAreaRef = React.createRef<Form.TextArea>();
          fieldRefs.current[`field_${field.name}`] = textAreaRef;
          if (enable_attachments) {
            fieldRefs.current[`file_${field.name}`] = React.createRef<Form.FilePicker>();
          }

          return (
            <React.Fragment key={field.name}>
              <Form.TextArea
                id={`field_${field.name}`}
                title={field.name}
                placeholder={`Enter ${field.name}`}
                ref={textAreaRef}
                value={
                  fieldValues[`field_${field.name}`] ??
                  (values[`field_${field.name}`] as string | undefined) ??
                  ''
                }
                onChange={next => {
                  setFieldValues(prev => ({ ...prev, [`field_${field.name}`]: next }));
                  setQualityScore(0);
                }}
              />
              {enable_attachments && (
                <Form.FilePicker
                  id={`file_${field.name}`}
                  title={`${field.name} Files`}
                  allowMultipleSelection
                  onChange={files => handleFileChange(field.name, files)}
                />
              )}
            </React.Fragment>
          );
        })}
      </>
    );
  }, [selectedModel, enable_attachments, fieldValues, values, setValidationError]);

  const navTitle = addedCount > 0 ? `Add Card (${addedCount} added)` : 'Add Card';
  const aiActionsDisabled = !ai_enabled;

  return (
    <>
      {decksError || tagsError || modelsError ? (
        <Detail markdown={errorMarkdown} />
      ) : (
        <Form
          actions={
            <ActionPanel>
              <ActionPanel.Section title="Card">
                <Action.SubmitForm title="Add Card" onSubmit={handleSubmit} />
                <Action
                  title="Clear Form"
                  shortcut={shortcuts.clearForm}
                  onAction={async () => {
                    handleClearForm();
                    await clearSavedDraft();
                  }}
                />
              </ActionPanel.Section>

              <ActionPanel.Section title="AI Assist">
                <Action
                  title={ai_enabled ? 'AI: Fill from Notes' : 'AI: Fill from Notes (Disabled)'}
                  shortcut={{ modifiers: ['ctrl'], key: 'a' }}
                  onAction={async () => {
                    if (aiActionsDisabled) {
                      await showToast({ style: Toast.Style.Failure, title: 'AI is disabled', message: 'Enable AI Assist in extension preferences.' });
                      return;
                    }
                    if (!draftText.trim()) {
                      await showToast({ style: Toast.Style.Failure, title: 'No source notes', message: 'Paste notes into Source Notes first.' });
                      return;
                    }
                    const { handleAIAutocomplete } = await import('../ai');
                    await handleAIAutocomplete({
                      draftText,
                      fieldValues,
                      setFieldValues,
                      values,
                      setValue: formSetValue,
                      models: models || [],
                      availableTags: tags || [],
                    });
                  }}
                />
                <Action
                  title={ai_enabled ? 'AI: Improve Card' : 'AI: Improve Card (Disabled)'}
                  shortcut={{ modifiers: ['ctrl'], key: 'i' }}
                  onAction={async () => {
                    if (aiActionsDisabled) {
                      await showToast({ style: Toast.Style.Failure, title: 'AI is disabled', message: 'Enable AI Assist in extension preferences.' });
                      return;
                    }
                    if (!hasCardContent) {
                      await showToast({ style: Toast.Style.Failure, title: 'No card content', message: 'Fill card fields first.' });
                      return;
                    }
                    const { handleAIImprove } = await import('../ai');
                    await handleAIImprove({
                      fieldValues,
                      setFieldValues,
                      values,
                      setValue: formSetValue,
                      models: models || [],
                      availableTags: tags || [],
                    });
                  }}
                />
                <Action
                  title={ai_enabled ? 'AI: Suggest Tags' : 'AI: Suggest Tags (Disabled)'}
                  shortcut={{ modifiers: ['ctrl'], key: 't' }}
                  onAction={async () => {
                    if (aiActionsDisabled) {
                      await showToast({ style: Toast.Style.Failure, title: 'AI is disabled', message: 'Enable AI Assist in extension preferences.' });
                      return;
                    }
                    if (!hasCardContent) {
                      await showToast({ style: Toast.Style.Failure, title: 'No card content', message: 'Fill card fields first.' });
                      return;
                    }
                    const { handleAISuggestTags } = await import('../ai');
                    await handleAISuggestTags({
                      fieldValues,
                      setFieldValues,
                      values,
                      setValue: formSetValue,
                      models: models || [],
                      availableTags: tags || [],
                    });
                  }}
                />
                <Action
                  title={ai_enabled ? 'AI: Switch Note Type' : 'AI: Switch Note Type (Disabled)'}
                  shortcut={{ modifiers: ['ctrl'], key: 'b' }}
                  onAction={async () => {
                    if (aiActionsDisabled) {
                      await showToast({ style: Toast.Style.Failure, title: 'AI is disabled', message: 'Enable AI Assist in extension preferences.' });
                      return;
                    }
                    if (!hasCardContent) {
                      await showToast({ style: Toast.Style.Failure, title: 'No card content', message: 'Fill card fields first.' });
                      return;
                    }
                    const { handleAIConvert } = await import('../ai');
                    await handleAIConvert({
                      mode: 'auto',
                      fieldValues,
                      setFieldValues,
                      values,
                      setValue: formSetValue,
                      models: models || [],
                      availableTags: tags || [],
                    });
                  }}
                />
                <Action
                  title={ai_enabled ? 'AI: Score Quality' : 'AI: Score Quality (Disabled)'}
                  shortcut={{ modifiers: ['ctrl'], key: 'q' }}
                  onAction={async () => {
                    if (aiActionsDisabled) {
                      await showToast({ style: Toast.Style.Failure, title: 'AI is disabled', message: 'Enable AI Assist in extension preferences.' });
                      return;
                    }
                    if (!hasCardContent) {
                      await showToast({ style: Toast.Style.Failure, title: 'No card content', message: 'Fill card fields first.' });
                      return;
                    }
                    await handleAIScoreAction();
                  }}
                />
              </ActionPanel.Section>
            </ActionPanel>
          }
          navigationTitle={navTitle}
          isLoading={decksLoading || modelsLoading || tagsLoading || defaultsLoading}
        >
          <Form.Dropdown
            id="deckName"
            title="Deck"
            value={values.deckName}
            storeValue={true}
            isLoading={decksLoading}
            onChange={handleDeckChange}
          >
            {defaultDeck && sortedDecks.length > 0 && sortedDecks[0]?.name === defaultDeck && (
              <Form.Dropdown.Section title="Recent">
                <Form.Dropdown.Item
                  key={`recent-${sortedDecks[0].deck_id}`}
                  title={sortedDecks[0].name}
                  value={sortedDecks[0].name}
                />
              </Form.Dropdown.Section>
            )}
            <Form.Dropdown.Section title={defaultDeck ? 'All Decks' : undefined}>
              {(defaultDeck ? sortedDecks.slice(1) : sortedDecks).map(deck => (
                <Form.Dropdown.Item key={deck.deck_id} title={deck.name} value={deck.name} />
              ))}
            </Form.Dropdown.Section>
          </Form.Dropdown>

          <Form.Dropdown
            id="modelName"
            title="Note Type"
            value={values.modelName}
            storeValue={true}
            isLoading={modelsLoading}
            onChange={handleModelChange}
          >
            {models?.map(model => (
              <Form.Dropdown.Item key={model.id} title={model.name} value={model.name} />
            ))}
          </Form.Dropdown>

          {show_draft_field && (
            <>
              <Form.TextArea
                id="draft"
                title="Source Notes"
                placeholder="Paste your raw notes, lecture content, or study material here. AI will use this to fill card fields."
                value={draftText}
                onChange={next => {
                  setDraftText(next);
                  setQualityScore(0);
                }}
              />
              <Form.Description
                title="AI Fill"
                text={'Use Ctrl+A or "AI: Fill from Notes" to populate fields from Source Notes.'}
              />
            </>
          )}

          <Form.Separator />

          {dynamicFields}

          <Form.Description title="AI Score" text={`Card Quality: ${qualityScore}/10`} />

          <Form.Separator />

          <Form.TagPicker id="tags" title="Tags" value={values.tags || []} ref={tagsCardRef} onChange={next => setValue('tags', next)}>
            {tags?.map(tag => <Form.TagPicker.Item key={tag} value={tag} title={tag} />)}
          </Form.TagPicker>
          <Form.Description
            title="Tag Suggestions"
            text={'Use Ctrl+T or "AI: Suggest Tags". Disabled until card fields have content.'}
          />
        </Form>
      )}
    </>
  );
}

function scoreMarkdown(score: CardScore): string {
  const emoji = score.score >= 8 ? '🟢' : score.score >= 5 ? '🟡' : '🔴';
  const parts = [`# ${emoji} Card Quality: ${score.score}/10 — ${score.grade}`, '', '## Feedback'];
  for (const feedback of score.feedback) {
    parts.push(`- ${feedback}`);
  }

  if (score.improvedCard) {
    parts.push('', '---', '', '## Suggested Improvement');
    if (score.improvedCard.front) parts.push(`**Front:** ${score.improvedCard.front}`);
    if (score.improvedCard.back) parts.push(`**Back:** ${score.improvedCard.back}`);
    if (score.improvedCard.text) parts.push(`**Text:** ${score.improvedCard.text}`);
    if (score.improvedCard.extra) parts.push(`**Extra:** ${score.improvedCard.extra}`);
    if (score.improvedCard.code) parts.push(`**Code:** ${score.improvedCard.code}`);
  }

  return parts.join('\n');
}

function ScoreDetailView({
  score,
  hasImprovement,
  onApplyImprovement,
}: {
  score: CardScore;
  hasImprovement: boolean;
  onApplyImprovement: () => void;
}) {
  const { pop } = useNavigation();
  return (
    <Detail
      navigationTitle="Card Quality Score"
      markdown={scoreMarkdown(score)}
      actions={
        <ActionPanel>
          {hasImprovement ? (
            <Action
              title="Apply Improvement"
              onAction={() => {
                onApplyImprovement();
                pop();
              }}
            />
          ) : null}
          <Action title="Close" onAction={pop} />
        </ActionPanel>
      }
    />
  );
}

function ScoreBeforeAddDetail({
  score,
  onApplyImprovement,
  onConfirmAdd,
}: {
  score: CardScore;
  onApplyImprovement: () => void;
  onConfirmAdd: () => Promise<void>;
}) {
  const { pop } = useNavigation();
  return (
    <Detail
      navigationTitle="Review Before Adding"
      markdown={scoreMarkdown(score)}
      actions={
        <ActionPanel>
          {score.improvedCard ? (
            <Action
              title="Apply Improvement"
              onAction={() => {
                onApplyImprovement();
                pop();
              }}
            />
          ) : null}
          <Action
            title="Add Card"
            onAction={async () => {
              await onConfirmAdd();
              pop();
            }}
          />
          <Action title="Cancel" onAction={pop} />
        </ActionPanel>
      }
    />
  );
}
