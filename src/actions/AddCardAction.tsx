import {
  Action,
  ActionPanel,
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
import { ReviewCardsList } from '../components/ReviewCardsList';

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
  const { push } = useNavigation();
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

  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [draftText, setDraftText] = useState('');
  const [qualityScore, setQualityScore] = useState(0);
  const [lastScoreResult, setLastScoreResult] = useState<CardScore | null>(null);
  const [addedCount, setAddedCount] = useState(0);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [generateMultiple, setGenerateMultiple] = useState(false);
  const [cardCount, setCardCount] = useState('5');
  const isAIUpdating = useRef(false);

  const { allow_empty_card_fields, enable_attachments } =
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
      onSubmit: async submittedValues => {
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

            setLastScoreResult(scoreResult);
            push(
              <ScoreBeforeAddDetail
                score={scoreResult}
                onApplyImprovement={() => {
                  if (scoreResult.improvedCard) {
                    isAIUpdating.current = true;
                    applyImprovement(scoreResult.improvedCard);
                    setTimeout(() => {
                      isAIUpdating.current = false;
                    }, 100);
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
        timestamp: timestampField
          ? resolveFieldValue(mergedValues, timestampField.name)
          : undefined,
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
        if (lower === 'front' && card.front !== undefined)
          nextValues[`field_${field.name}`] = card.front;
        if (lower === 'back' && card.back !== undefined)
          nextValues[`field_${field.name}`] = card.back;
        if (lower === 'text' && card.text !== undefined)
          nextValues[`field_${field.name}`] = card.text;
        if (lower === 'extra' && card.extra !== undefined)
          nextValues[`field_${field.name}`] = card.extra;
        if (lower === 'code' && card.code !== undefined)
          nextValues[`field_${field.name}`] = card.code;
        if (lower.includes('timestamp') && card.timestamp !== undefined) {
          nextValues[`field_${field.name}`] = card.timestamp;
        }
      }

      if (Object.keys(nextValues).length > 0) {
        setFieldValues(prev => ({ ...prev, ...nextValues }));
      }

      if (card.tags && card.tags.length > 0) {
        setSuggestedTags(prev => [...new Set([...prev, ...card.tags])]);
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
        const tagSummary =
          prepared.tags.length > 0 ? ` · ${prepared.tags.slice(0, 2).join(', ')}` : '';

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
    setLastScoreResult(null);
    setSuggestedTags([]);
    setGenerateMultiple(false);
    setCardCount('5');
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
      if (!isAIUpdating.current) {
        setQualityScore(0);
        setLastScoreResult(null);
      }

      if (previousModel && previousModel !== nextModel) {
        clearModelFields(previousModel);
      }
      setFieldValues({});
    },
    [values.modelName, setValue, persistModel, clearModelFields]
  );

  /**
   * Switch model AND apply new field values atomically.
   * Used by AI actions that change note type (convert, comprehensive fill).
   */
  const handleModelSwitchWithFields = useCallback(
    (nextModel: string) => {
      const previousModel = values.modelName;
      setValue('modelName', nextModel);
      void persistModel(nextModel);
      if (!isAIUpdating.current) {
        setQualityScore(0);
        setLastScoreResult(null);
      }

      if (previousModel && previousModel !== nextModel) {
        if (models) {
          const oldModel = models.find(m => m.name === previousModel);
          if (oldModel) {
            for (const field of oldModel.flds) {
              formSetValue(`field_${field.name}`, '');
              setValidationError(`field_${field.name}`, undefined);
            }
          }
        }
      }
    },
    [values.modelName, setValue, persistModel, models, formSetValue, setValidationError]
  );

  const handleFileChange = (fieldName: string, files: string[]) => {
    const invalidFiles = files.filter(file => !isValidFileType(file));
    if (invalidFiles.length > 0) {
      setValidationError(`file_${fieldName}`, `Invalid file type(s): ${invalidFiles.join(', ')}`);
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
      setLastScoreResult(scoreResult);
      push(
        <ScoreDetailView
          score={scoreResult}
          hasImprovement={!!scoreResult.improvedCard}
          onApplyImprovement={() => {
            if (scoreResult.improvedCard) {
              isAIUpdating.current = true;
              applyImprovement(scoreResult.improvedCard);
              setTimeout(() => {
                isAIUpdating.current = false;
              }, 100);
            }
          }}
        />
      );
    } catch (error) {
      handleError(error);
    }
  }, [buildSubmission, values, push, applyImprovement, handleError]);

  const sortedDecks = useMemo(() => {
    if (!decks) return [];
    const lastDeck = defaultDeck;
    if (!lastDeck) return decks;
    const recent = decks.filter(d => d.name === lastDeck);
    const rest = decks.filter(d => d.name !== lastDeck);
    return [...recent, ...rest];
  }, [decks, defaultDeck]);

  const allTags = useMemo(() => {
    const set = new Set([...(tags || []), ...suggestedTags]);
    return [...set].sort();
  }, [tags, suggestedTags]);

  const isTimestampField = useCallback((fieldName: string) => {
    const lower = fieldName.toLowerCase();
    return lower.includes('timestamp') || lower === 'source' || lower === 'timestamp/source';
  }, []);

  const getFieldRef = useCallback((key: string) => {
    if (!fieldRefs.current[key]) {
      fieldRefs.current[key] = React.createRef();
    }
    return fieldRefs.current[key];
  }, []);

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
                  title={ai_enabled ? 'AI: Fill from Source' : 'AI: Fill from Source (Disabled)'}
                  shortcut={{ modifiers: ['ctrl'], key: 'a' }}
                  onAction={async () => {
                    if (aiActionsDisabled) {
                      await showToast({
                        style: Toast.Style.Failure,
                        title: 'AI is disabled',
                        message: 'Enable AI Assist in extension preferences.',
                      });
                      return;
                    }
                    if (!draftText.trim()) {
                      await showToast({
                        style: Toast.Style.Failure,
                        title: 'No source material',
                        message: 'Paste content into AI Source Material first.',
                      });
                      return;
                    }

                    if (generateMultiple) {
                      const n = parseInt(cardCount, 10);
                      if (isNaN(n) || n < 1 || n > 20) {
                        await showToast({
                          style: Toast.Style.Failure,
                          title: 'Card count must be 1-20',
                        });
                        return;
                      }
                      try {
                        await showToast({
                          style: Toast.Style.Animated,
                          title: 'Generating multiple cards...',
                        });
                        const { generateCardsFromDraft } = await import('../ai');
                        const response = await generateCardsFromDraft(draftText, n);
                        await showToast({
                          style: Toast.Style.Success,
                          title: `Generated ${response.cards.length} cards`,
                        });
                        push(
                          <ReviewCardsList
                            response={response}
                            preSelectedDeck={values.deckName}
                            preSelectedTags={values.tags}
                          />
                        );
                      } catch (error) {
                        const msg = error instanceof Error ? error.message : String(error);
                        await showToast({
                          style: Toast.Style.Failure,
                          title: 'Generation failed',
                          message: msg.slice(0, 120),
                        });
                      }
                      return;
                    }

                    isAIUpdating.current = true;
                    try {
                      const { handleComprehensiveFill } = await import('../ai');
                      await handleComprehensiveFill({
                        sourceText: draftText,
                        fieldValues,
                        setFieldValues,
                        values,
                        setValue: formSetValue,
                        models: models || [],
                        decks: decks || [],
                        availableTags: tags || [],
                        defaultDeck,
                        handleModelSwitch: handleModelSwitchWithFields,
                        setSuggestedTags,
                        setQualityScore,
                        setLastScoreResult,
                      });
                    } finally {
                      setTimeout(() => {
                        isAIUpdating.current = false;
                      }, 100);
                    }
                  }}
                />
                <Action
                  title={ai_enabled ? 'AI: Improve Card' : 'AI: Improve Card (Disabled)'}
                  shortcut={{ modifiers: ['ctrl'], key: 'i' }}
                  onAction={async () => {
                    if (aiActionsDisabled) {
                      await showToast({
                        style: Toast.Style.Failure,
                        title: 'AI is disabled',
                        message: 'Enable AI Assist in extension preferences.',
                      });
                      return;
                    }
                    if (!hasCardContent) {
                      await showToast({
                        style: Toast.Style.Failure,
                        title: 'No card content',
                        message: 'Fill card fields first.',
                      });
                      return;
                    }
                    isAIUpdating.current = true;
                    try {
                      const { handleAIImprove } = await import('../ai');
                      await handleAIImprove({
                        fieldValues,
                        setFieldValues,
                        values,
                        setValue: formSetValue,
                        models: models || [],
                        availableTags: tags || [],
                        handleModelSwitch: handleModelSwitchWithFields,
                      });
                    } finally {
                      setTimeout(() => {
                        isAIUpdating.current = false;
                      }, 100);
                    }
                  }}
                />
                <Action
                  title={ai_enabled ? 'AI: Suggest Tags' : 'AI: Suggest Tags (Disabled)'}
                  shortcut={{ modifiers: ['ctrl'], key: 't' }}
                  onAction={async () => {
                    if (aiActionsDisabled) {
                      await showToast({
                        style: Toast.Style.Failure,
                        title: 'AI is disabled',
                        message: 'Enable AI Assist in extension preferences.',
                      });
                      return;
                    }
                    if (!hasCardContent) {
                      await showToast({
                        style: Toast.Style.Failure,
                        title: 'No card content',
                        message: 'Fill card fields first.',
                      });
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
                      setSuggestedTags,
                    });
                  }}
                />
                <Action
                  title={ai_enabled ? 'AI: Switch Note Type' : 'AI: Switch Note Type (Disabled)'}
                  shortcut={{ modifiers: ['ctrl'], key: 'b' }}
                  onAction={async () => {
                    if (aiActionsDisabled) {
                      await showToast({
                        style: Toast.Style.Failure,
                        title: 'AI is disabled',
                        message: 'Enable AI Assist in extension preferences.',
                      });
                      return;
                    }
                    if (!hasCardContent) {
                      await showToast({
                        style: Toast.Style.Failure,
                        title: 'No card content',
                        message: 'Fill card fields first.',
                      });
                      return;
                    }
                    const clozeName = prefs.cloze_model_name || 'Cloze';
                    const currentIsCloze = values.modelName === clozeName;
                    const targetMode = currentIsCloze ? 'basic' : 'cloze';

                    isAIUpdating.current = true;
                    try {
                      const { handleAIConvert } = await import('../ai');
                      await handleAIConvert({
                        mode: targetMode,
                        fieldValues,
                        setFieldValues,
                        values,
                        setValue: formSetValue,
                        models: models || [],
                        availableTags: tags || [],
                        handleModelSwitch: handleModelSwitchWithFields,
                      });
                    } finally {
                      setTimeout(() => {
                        isAIUpdating.current = false;
                      }, 100);
                    }
                  }}
                />
                <Action
                  title={ai_enabled ? 'AI: Score Quality' : 'AI: Score Quality (Disabled)'}
                  shortcut={{ modifiers: ['ctrl'], key: 'q' }}
                  onAction={async () => {
                    if (aiActionsDisabled) {
                      await showToast({
                        style: Toast.Style.Failure,
                        title: 'AI is disabled',
                        message: 'Enable AI Assist in extension preferences.',
                      });
                      return;
                    }
                    if (!hasCardContent) {
                      await showToast({
                        style: Toast.Style.Failure,
                        title: 'No card content',
                        message: 'Fill card fields first.',
                      });
                      return;
                    }
                    await handleAIScoreAction();
                  }}
                />
                {qualityScore > 0 && (
                  <Action
                    title="View Score Details"
                    shortcut={{ modifiers: ['ctrl'], key: 'd' }}
                    onAction={async () => {
                      if (lastScoreResult) {
                        push(
                          <ScoreDetailView
                            score={lastScoreResult}
                            hasImprovement={!!lastScoreResult.improvedCard}
                            onApplyImprovement={() => {
                              if (lastScoreResult.improvedCard) {
                                isAIUpdating.current = true;
                                applyImprovement(lastScoreResult.improvedCard);
                                setTimeout(() => {
                                  isAIUpdating.current = false;
                                }, 100);
                              }
                            }}
                          />
                        );
                      } else {
                        await handleAIScoreAction();
                      }
                    }}
                  />
                )}
              </ActionPanel.Section>
            </ActionPanel>
          }
          navigationTitle={navTitle}
          isLoading={decksLoading || modelsLoading || tagsLoading || defaultsLoading}
        >
          {/* === AI Source Material (top of form when AI is enabled) === */}
          {ai_enabled && (
            <>
              <Form.TextArea
                id="draft"
                title="AI Source Material"
                placeholder="Paste your raw notes, lecture content, or study material here. Press Ctrl+A to let AI fill everything."
                value={draftText}
                onChange={next => {
                  setDraftText(next);
                  if (!isAIUpdating.current) {
                    setQualityScore(0);
                    setLastScoreResult(null);
                  }
                }}
              />
              <Form.Description text="Ctrl+A — AI fills all fields, selects deck, note type, tags, and scores" />
            </>
          )}

          {/* === AI Score === */}
          {ai_enabled && (
            <>
              <Form.Description title="AI Score" text={`Card Quality: ${qualityScore}/10`} />
              <Form.Description
                text={
                  qualityScore > 0
                    ? 'Ctrl+D — View score details · Ctrl+Q — Re-score'
                    : 'Ctrl+Q — Score card quality'
                }
              />
            </>
          )}

          {/* === Deck === */}
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

          {/* === Note Type === */}
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
          {ai_enabled && <Form.Description text="Ctrl+B — Switch between Basic and Cloze" />}

          {/* === Generate Multiple Cards toggle === */}
          {ai_enabled && (
            <>
              <Form.Checkbox
                id="generateMultiple"
                label="Generate Multiple Cards"
                value={generateMultiple}
                onChange={setGenerateMultiple}
              />
              {generateMultiple && (
                <Form.TextField
                  id="cardCount"
                  title="Number of Cards"
                  placeholder="5"
                  value={cardCount}
                  onChange={setCardCount}
                />
              )}
            </>
          )}

          <Form.Separator />

          {/* === Dynamic Card Fields === */}
          {selectedModel?.flds.map(field => {
            const fieldKey = `field_${field.name}`;
            const textAreaRef = getFieldRef(fieldKey);
            if (enable_attachments) {
              getFieldRef(`file_${field.name}`);
            }
            const isTimestamp = isTimestampField(field.name);
            const placeholder = isTimestamp
              ? 'e.g., CS50 W2 12:34, LeetCode #42, youtube.com/...'
              : `Enter ${field.name}`;

            return (
              <React.Fragment key={field.name}>
                <Form.TextArea
                  id={fieldKey}
                  title={field.name}
                  placeholder={placeholder}
                  ref={textAreaRef}
                  value={fieldValues[fieldKey] || ''}
                  onChange={next => {
                    setFieldValues(prev => {
                      if (prev[fieldKey] === next) return prev;
                      return { ...prev, [fieldKey]: next };
                    });
                    if (!isAIUpdating.current) {
                      setQualityScore(0);
                      setLastScoreResult(null);
                    }
                  }}
                />
                {isTimestamp && (
                  <Form.Description text="Add your source reference here (URL, book, lecture, etc.)" />
                )}
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

          <Form.Separator />

          {/* === Tags === */}
          <Form.TagPicker
            id="tags"
            title="Tags"
            value={values.tags || []}
            ref={tagsCardRef}
            onChange={next => setValue('tags', next)}
          >
            {allTags.map(tag => (
              <Form.TagPicker.Item key={tag} value={tag} title={tag} />
            ))}
          </Form.TagPicker>
          {ai_enabled && <Form.Description text="Ctrl+T — AI suggests tags from card content" />}
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
