import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Form,
  getPreferenceValues,
  List,
  showHUD,
  showToast,
  Toast,
  useNavigation,
} from '@raycast/api';
import noteActions from '../api/noteActions';
import guiActions from '../api/guiActions';
import { useCachedPromise, useForm } from '@raycast/utils';
import deckActions from '../api/deckActions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CreateCardFormValues, FieldRef, ShortcutDictionary } from '../types';
import modelActions from '../api/modelActions';
import React from 'react';
import {
  isValidFileType,
  transformSubmittedData,
  normalizeFormatting,
  parseClipboardContent,
} from '../util';
import useErrorHandling from '../hooks/useErrorHandling';
import { useDefaults } from '../hooks/useDefaults';
import { useDraftPersistence } from '../hooks/useDraftPersistence';
import { TEMPLATES, getTemplateById, CardTemplate } from '../templates';

interface Props {
  deckName?: string;
}

interface SessionCard {
  noteId: number;
  deckName: string;
  modelName: string;
  frontText: string;
  tags: string[];
  timestamp: number;
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

  const [selectedTemplate, setSelectedTemplate] = useState<string>('none');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [draftText, setDraftText] = useState('');
  const [sessionCards, setSessionCards] = useState<SessionCard[]>([]);
  const templateAutoDetectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { allow_empty_card_fields, enable_attachments, show_field_hints, show_draft_field } =
    getPreferenceValues<Preferences.AddCard>();

  const { ai_enabled } = getPreferenceValues<Preferences>();

  const { restoredState, clearSavedDraft } = useDraftPersistence({
    draftText,
    fieldValues,
    selectedTemplate,
    deckName: deckName,
  });

  useEffect(() => {
    if (!restoredState) return;
    if (restoredState.draftText) setDraftText(restoredState.draftText);
    if (restoredState.fieldValues && Object.keys(restoredState.fieldValues).length > 0) {
      setFieldValues(restoredState.fieldValues);
    }
    if (restoredState.selectedTemplate && restoredState.selectedTemplate !== 'none') {
      setSelectedTemplate(restoredState.selectedTemplate);
    }
  }, [restoredState]);

  const shortcuts = useMemo((): ShortcutDictionary => {
    return {
      clearForm: { modifiers: ['cmd'], key: 'x' },
      keepTemplate: { modifiers: ['cmd', 'shift'], key: 'return' },
      swapFields: { modifiers: ['cmd', 'shift'], key: 's' },
      normalize: { modifiers: ['cmd', 'shift'], key: 'n' },
    };
  }, []);

  const { handleSubmit, itemProps, values, reset, focus, setValidationError, setValue } =
    useForm<CreateCardFormValues>({
      initialValues: {
        deckName: defaultDeck || deckName || '',
        modelName: defaultModel || '',
        tags: defaultTags,
      },
      onSubmit: async values => {
        if (!models || modelsLoading || modelsError) return;
        try {
          const selectedModel = models.find(model => values.modelName === model.name);
          if (!selectedModel) return;
          const fieldNames = selectedModel.flds.map(fld => fld.name);

          const mergedValues = { ...values };
          for (const fn of fieldNames) {
            const key = `field_${fn}`;
            if (fieldValues[key] !== undefined) {
              (mergedValues as Record<string, unknown>)[key] = fieldValues[key];
            }
          }

          const createCardRequestBody = transformSubmittedData(
            mergedValues as CreateCardFormValues,
            fieldNames,
            enable_attachments
          );

          if (!allow_empty_card_fields) {
            for (const fieldName of fieldNames) {
              const fieldValue = (mergedValues as Record<string, unknown>)[`field_${fieldName}`];
              if (!fieldValue || (typeof fieldValue === 'string' && fieldValue.trim() === '')) {
                setValidationError(`field_${fieldName}`, `${fieldName} is required`);
                return;
              }
            }
          }

          const noteId = await noteActions.addNote(createCardRequestBody);

          const frontText =
            fieldValues[`field_${fieldNames[0]}`] ||
            ((mergedValues as Record<string, unknown>)[`field_${fieldNames[0]}`] as string) ||
            '';

          setSessionCards(prev => [
            ...prev,
            {
              noteId,
              deckName: values.deckName,
              modelName: values.modelName,
              frontText: frontText.slice(0, 100),
              tags: values.tags || [],
              timestamp: Date.now(),
            },
          ]);

          await showHUD(`Added to ${values.deckName}: ${frontText.slice(0, 40)}`);

          showToast({
            style: Toast.Style.Success,
            title: `Card added to ${values.deckName}`,
            message: frontText.slice(0, 60),
            primaryAction: {
              title: 'View Details',
              onAction: () => {
                push(
                  <CardConfirmationDetail
                    deckName={values.deckName}
                    modelName={values.modelName}
                    fields={createCardRequestBody.fields}
                    tags={values.tags || []}
                    noteId={noteId}
                  />
                );
              },
            },
            secondaryAction: {
              title: 'Open in Anki',
              onAction: async () => {
                await guiActions.guiBrowse(`nid:${noteId}`);
              },
            },
          });

          await persistDefaults(values.deckName, values.modelName);
          await clearSavedDraft();
          handleClearForm();

          return true;
        } catch (error) {
          handleError(error);
        }
      },
    });

  const formSetValue = setValue as (id: string, value: string | string[]) => void;

  useEffect(() => {
    if (!defaultsLoading && defaultDeck && !values.deckName) {
      setValue('deckName', defaultDeck);
    }
    if (!defaultsLoading && defaultModel && !values.modelName) {
      setValue('modelName', defaultModel);
    }
  }, [defaultsLoading, defaultDeck, defaultModel]);

  useEffect(() => {
    const error = decksError || tagsError || modelsError;
    if (!error) return;
    handleError(error);
  }, [decksError, tagsError, modelsError]);

  // AI template auto-detection on draft change
  useEffect(() => {
    if (!ai_enabled || selectedTemplate !== 'none' || !draftText.trim() || draftText.length < 20)
      return;

    if (templateAutoDetectTimer.current) clearTimeout(templateAutoDetectTimer.current);
    templateAutoDetectTimer.current = setTimeout(async () => {
      try {
        const { detectTemplate } = await import('../ai');
        const detected = await detectTemplate(draftText);
        if (detected) {
          setSelectedTemplate(detected);
          const tmpl = getTemplateById(detected);
          if (tmpl) {
            showToast({
              style: Toast.Style.Success,
              title: `Detected: ${tmpl.name}`,
            });
          }
        }
      } catch {
        // silently ignore detection errors
      }
    }, 800);

    return () => {
      if (templateAutoDetectTimer.current) clearTimeout(templateAutoDetectTimer.current);
    };
  }, [draftText, ai_enabled, selectedTemplate]);

  const handleClearForm = useCallback(() => {
    reset();
    setFieldValues({});
    setDraftText('');
    tagsCardRef.current?.reset();
    Object.values(fieldRefs.current).forEach(ref => {
      if (ref.current && ref.current.reset) {
        ref.current.reset();
      }
    });
    focus('deckName');
  }, [reset, focus]);

  const handleClearKeepTemplate = useCallback(() => {
    const currentTemplate = selectedTemplate;
    const currentDeck = values.deckName;
    const currentModel = values.modelName;
    const currentTags = values.tags;

    reset();
    setFieldValues({});
    setDraftText('');

    Object.values(fieldRefs.current).forEach(ref => {
      if (ref.current && ref.current.reset) {
        ref.current.reset();
      }
    });

    setTimeout(() => {
      setValue('deckName', currentDeck);
      setValue('modelName', currentModel);
      setValue('tags', currentTags);
      setSelectedTemplate(currentTemplate);
    }, 50);
  }, [selectedTemplate, values, reset, setValue]);

  const handleAddSimilar = useCallback(() => {
    if (!models || !values.modelName) return;
    const selectedModel = models.find(m => m.name === values.modelName);
    if (!selectedModel || selectedModel.flds.length < 1) return;

    const firstFieldKey = `field_${selectedModel.flds[0].name}`;
    setFieldValues(prev => ({ ...prev, [firstFieldKey]: '' }));
    setDraftText('');
    focus(`field_${selectedModel.flds[0].name}`);
    showToast({ style: Toast.Style.Success, title: 'Ready for similar card' });
  }, [models, values, focus]);

  const handleFileChange = (fieldName: string, files: string[]) => {
    const invalidFiles = files.filter(file => !isValidFileType(file));
    if (invalidFiles.length > 0) {
      setValidationError(
        `file_${fieldName}`,
        `Invalid file type(s) selected: ${invalidFiles.join(', ')}`
      );
    } else {
      setValidationError(`file_${fieldName}`, undefined);
    }
  };

  const handleTemplateChange = useCallback(
    (templateId: string) => {
      setSelectedTemplate(templateId);
      if (templateId === 'none') return;

      const template = getTemplateById(templateId);
      if (!template) return;

      const currentTags = values.tags || [];
      const mergedTags = [...new Set([...currentTags, ...template.tags, ...defaultTags])];
      setValue('tags', mergedTags);

      if (models && !modelsLoading) {
        const preferredModel = models.find(
          m => m.name.toLowerCase() === template.preferredModel.toLowerCase()
        );
        if (preferredModel) {
          setValue('modelName', preferredModel.name);
        }
      }
    },
    [models, modelsLoading, values.tags, defaultTags, setValue]
  );

  const handleSwapFrontBack = useCallback(() => {
    if (!models || !values.modelName) return;
    const selectedModel = models.find(m => m.name === values.modelName);
    if (!selectedModel || selectedModel.flds.length < 2) return;

    const firstKey = `field_${selectedModel.flds[0].name}`;
    const secondKey = `field_${selectedModel.flds[1].name}`;
    const vals = values as Record<string, unknown>;
    const firstVal = fieldValues[firstKey] || (vals[firstKey] as string) || '';
    const secondVal = fieldValues[secondKey] || (vals[secondKey] as string) || '';

    setFieldValues(prev => ({ ...prev, [firstKey]: secondVal, [secondKey]: firstVal }));
    showToast({ style: Toast.Style.Success, title: 'Swapped Front/Back' });
  }, [models, values, fieldValues]);

  const handleNormalize = useCallback(() => {
    const updated = { ...fieldValues };
    let changed = false;
    for (const [key, val] of Object.entries(updated)) {
      if (key.startsWith('field_') && typeof val === 'string') {
        const normalized = normalizeFormatting(val);
        if (normalized !== val) {
          updated[key] = normalized;
          changed = true;
        }
      }
    }
    if (changed) {
      setFieldValues(updated);
      showToast({ style: Toast.Style.Success, title: 'Formatting normalized' });
    }
  }, [fieldValues]);

  const handleCopyFront = useCallback(async () => {
    if (!models || !values.modelName) return;
    const selectedModel = models.find(m => m.name === values.modelName);
    if (!selectedModel || selectedModel.flds.length < 1) return;
    const key = `field_${selectedModel.flds[0].name}`;
    const val = fieldValues[key] || ((values as Record<string, unknown>)[key] as string) || '';
    await Clipboard.copy(val);
    showToast({ style: Toast.Style.Success, title: 'Copied to clipboard' });
  }, [models, values, fieldValues]);

  const handleSmartPaste = useCallback(async () => {
    if (!models || !values.modelName) return;
    const selectedModel = models.find(m => m.name === values.modelName);
    if (!selectedModel || selectedModel.flds.length < 1) return;
    const text = await Clipboard.readText();
    if (!text) return;

    const parsed = parseClipboardContent(text);
    if (parsed.front) {
      const updates: Record<string, string> = {};
      updates[`field_${selectedModel.flds[0].name}`] = parsed.front;
      if (parsed.back && selectedModel.flds.length >= 2) {
        updates[`field_${selectedModel.flds[1].name}`] = parsed.back;
      }
      if (parsed.extra) {
        const extraField = selectedModel.flds.find(f => f.name.toLowerCase() === 'extra');
        if (extraField) {
          updates[`field_${extraField.name}`] = parsed.extra;
        }
      }
      setFieldValues(prev => ({ ...prev, ...updates }));
      showToast({ style: Toast.Style.Success, title: 'Smart paste: fields populated' });
    } else {
      setFieldValues(prev => ({
        ...prev,
        [`field_${selectedModel.flds[0].name}`]: parsed.raw,
      }));
    }
  }, [models, values]);

  const handlePasteAsDraft = useCallback(async () => {
    const text = await Clipboard.readText();
    if (text) {
      setDraftText(text);
      showToast({ style: Toast.Style.Success, title: 'Clipboard pasted to draft' });
    }
  }, []);

  const handleDraftToBullets = useCallback(() => {
    if (!draftText.trim()) return;
    const lines = draftText.split('\n').filter(l => l.trim());
    const bulleted = lines.map(l => {
      const trimmed = l.trim();
      if (/^[-*•]\s/.test(trimmed)) return trimmed.replace(/^[-*]\s/, '• ');
      return `• ${trimmed}`;
    });
    setDraftText(bulleted.join('\n'));
  }, [draftText]);

  const activeTemplate: CardTemplate | undefined = useMemo(
    () => (selectedTemplate !== 'none' ? getTemplateById(selectedTemplate) : undefined),
    [selectedTemplate]
  );

  const getFieldHint = (fieldName: string) => {
    if (!show_field_hints || !activeTemplate)
      return { title: fieldName, placeholder: `Enter ${fieldName}` };
    const hint = activeTemplate.fields[fieldName];
    if (!hint) return { title: fieldName, placeholder: `Enter ${fieldName}` };
    return {
      title: hint.label || fieldName,
      placeholder: hint.placeholder,
      info: hint.helpText,
    };
  };

  const sortedDecks = useMemo(() => {
    if (!decks) return [];
    const lastDeck = defaultDeck;
    if (!lastDeck) return decks;
    const recent = decks.filter(d => d.name === lastDeck);
    const rest = decks.filter(d => d.name !== lastDeck);
    return [...recent, ...rest];
  }, [decks, defaultDeck]);

  const fields = useMemo(() => {
    if (modelsLoading || modelsError || !models || !values.modelName) return null;

    const selectedModel = models.find(model => model.name === values.modelName);

    if (!selectedModel) {
      return null;
    }

    const { flds } = selectedModel;

    return (
      <>
        {flds.map(field => {
          const textAreaRef = React.createRef<Form.TextArea>();
          fieldRefs.current[`field_${field.name}`] = textAreaRef;

          if (enable_attachments) {
            const filePickerRef = React.createRef<Form.FilePicker>();
            fieldRefs.current[`file_${field.name}`] = filePickerRef;
          }

          const hint = getFieldHint(field.name);

          return (
            <React.Fragment key={field.name}>
              <Form.TextArea
                {...itemProps[`field_${field.name}`]}
                title={hint.title}
                placeholder={hint.placeholder}
                info={'info' in hint ? hint.info : undefined}
                ref={textAreaRef}
                value={
                  fieldValues[`field_${field.name}`] ??
                  (values[`field_${field.name}`] as string | undefined)
                }
                onChange={val => {
                  setFieldValues(prev => ({ ...prev, [`field_${field.name}`]: val }));
                }}
              />
              {enable_attachments && (
                <Form.FilePicker
                  {...itemProps[`file_${field.name}`]}
                  title={`${field.name} files`}
                  allowMultipleSelection
                  onChange={files => handleFileChange(field.name, files)}
                />
              )}
            </React.Fragment>
          );
        })}
      </>
    );
  }, [
    models,
    modelsLoading,
    modelsError,
    values.modelName,
    itemProps,
    enable_attachments,
    fieldValues,
    activeTemplate,
    show_field_hints,
  ]);

  const navTitle = sessionCards.length > 0
    ? `Add Card (${sessionCards.length} added)`
    : 'Add Card';

  return (
    <>
      {decksError || tagsError || modelsError ? (
        <Detail markdown={errorMarkdown} />
      ) : (
        <Form
          actions={
            <ActionPanel>
              <ActionPanel.Section title="Card Actions">
                <Action.SubmitForm title="Add Card" onSubmit={handleSubmit} />
                <Action
                  title="Add Card (Keep Template & Tags)"
                  shortcut={shortcuts.keepTemplate}
                  onAction={async () => {
                    const result = await handleSubmit(values);
                    if (result) handleClearKeepTemplate();
                  }}
                />
                <Action
                  title="Add Similar Card"
                  shortcut={{ modifiers: ['cmd', 'shift'], key: 'a' }}
                  onAction={handleAddSimilar}
                />
                <Action
                  title="Clear Form"
                  shortcut={shortcuts.clearForm}
                  onAction={async () => {
                    handleClearForm();
                    await clearSavedDraft();
                  }}
                />
                {sessionCards.length > 0 && (
                  <Action
                    title="View Session History"
                    shortcut={{ modifiers: ['cmd', 'shift'], key: 'h' }}
                    onAction={() => push(<SessionHistoryList cards={sessionCards} />)}
                  />
                )}
              </ActionPanel.Section>

              <ActionPanel.Section title="Edit Helpers">
                <Action
                  title="Swap Front/Back"
                  shortcut={shortcuts.swapFields}
                  onAction={handleSwapFrontBack}
                />
                <Action
                  title="Normalize Formatting"
                  shortcut={shortcuts.normalize}
                  onAction={handleNormalize}
                />
                <Action
                  title="Copy Front to Clipboard"
                  shortcut={{ modifiers: ['cmd', 'shift'], key: 'c' }}
                  onAction={handleCopyFront}
                />
                <Action
                  title="Smart Paste From Clipboard"
                  shortcut={{ modifiers: ['cmd', 'shift'], key: 'v' }}
                  onAction={handleSmartPaste}
                />
                {show_draft_field && (
                  <>
                    <Action
                      title="Paste Clipboard as Draft"
                      shortcut={{ modifiers: ['cmd', 'shift'], key: 'd' }}
                      onAction={handlePasteAsDraft}
                    />
                    <Action
                      title="Draft to Bullets"
                      shortcut={{ modifiers: ['cmd', 'shift'], key: 'b' }}
                      onAction={handleDraftToBullets}
                    />
                  </>
                )}
              </ActionPanel.Section>

              {ai_enabled && (
                <ActionPanel.Section title="AI Assist">
                  <Action
                    title="AI: Autocomplete From Draft"
                    shortcut={{ modifiers: ['ctrl'], key: 'a' }}
                    onAction={async () => {
                      const { handleAIAutocomplete } = await import('../ai');
                      await handleAIAutocomplete({
                        draftText,
                        fieldValues,
                        setFieldValues,
                        values,
                        setValue: formSetValue,
                        models: models || [],
                        selectedTemplate: activeTemplate,
                      });
                    }}
                  />
                  <Action
                    title="AI: Improve / Atomicize Card"
                    shortcut={{ modifiers: ['ctrl'], key: 'i' }}
                    onAction={async () => {
                      const { handleAIImprove } = await import('../ai');
                      await handleAIImprove({
                        fieldValues,
                        setFieldValues,
                        values,
                        setValue: formSetValue,
                        models: models || [],
                        selectedTemplate: activeTemplate,
                      });
                    }}
                  />
                  <Action
                    title="AI: Score Card Quality"
                    shortcut={{ modifiers: ['ctrl'], key: 'q' }}
                    onAction={async () => {
                      const { handleAIScore } = await import('../ai');
                      const result = await handleAIScore({
                        fieldValues,
                        setFieldValues,
                        values,
                        setValue: formSetValue,
                        models: models || [],
                        selectedTemplate: activeTemplate,
                      });
                      if (result) {
                        push(
                          <ScoreDetailView
                            score={result as { score: number; grade: string; feedback: string[]; improvedCard?: Record<string, unknown> }}
                            hasImprovement={!!result.improvedCard}
                            onApplyImprovement={() => {
                              const card = result.improvedCard;
                              if (!card) return;
                              if (card.front) {
                                setFieldValues(prev => ({
                                  ...prev,
                                  field_Front: card.front || prev.field_Front,
                                  field_Back: card.back || prev.field_Back,
                                  field_Extra: card.extra || prev.field_Extra || '',
                                }));
                              } else if (card.text) {
                                setFieldValues(prev => ({
                                  ...prev,
                                  field_Text: card.text || prev.field_Text,
                                  field_Extra: card.extra || prev.field_Extra || '',
                                }));
                              }
                            }}
                          />
                        );
                      }
                    }}
                  />
                  <Action
                    title="AI: Suggest Tags"
                    shortcut={{ modifiers: ['ctrl'], key: 't' }}
                    onAction={async () => {
                      const { handleAISuggestTags } = await import('../ai');
                      await handleAISuggestTags({
                        fieldValues,
                        setFieldValues,
                        values,
                        setValue: formSetValue,
                        models: models || [],
                        selectedTemplate: activeTemplate,
                      });
                    }}
                  />
                  <Action
                    title="AI: Convert to Best Note Type"
                    shortcut={{ modifiers: ['ctrl'], key: 'b' }}
                    onAction={async () => {
                      const { handleAIConvert } = await import('../ai');
                      await handleAIConvert({
                        mode: 'auto',
                        fieldValues,
                        setFieldValues,
                        values,
                        setValue: formSetValue,
                        models: models || [],
                        selectedTemplate: activeTemplate,
                      });
                    }}
                  />
                  <Action
                    title="AI: Convert to Cloze"
                    onAction={async () => {
                      const { handleAIConvert } = await import('../ai');
                      await handleAIConvert({
                        mode: 'cloze',
                        fieldValues,
                        setFieldValues,
                        values,
                        setValue: formSetValue,
                        models: models || [],
                        selectedTemplate: activeTemplate,
                      });
                    }}
                  />
                  <Action
                    title="AI: Convert to Basic"
                    onAction={async () => {
                      const { handleAIConvert } = await import('../ai');
                      await handleAIConvert({
                        mode: 'basic',
                        fieldValues,
                        setFieldValues,
                        values,
                        setValue: formSetValue,
                        models: models || [],
                        selectedTemplate: activeTemplate,
                      });
                    }}
                  />
                </ActionPanel.Section>
              )}
            </ActionPanel>
          }
          navigationTitle={navTitle}
          isLoading={decksLoading || modelsLoading || tagsLoading || defaultsLoading}
        >
          <Form.Dropdown
            id="template"
            title="Template"
            value={selectedTemplate}
            onChange={handleTemplateChange}
          >
            <Form.Dropdown.Item key="none" title="No Template" value="none" />
            {TEMPLATES.map(t => (
              <Form.Dropdown.Item key={t.id} title={t.name} value={t.id} />
            ))}
          </Form.Dropdown>

          <Form.Separator />

          <Form.Dropdown
            {...itemProps.deckName}
            title="Deck"
            storeValue={true}
            isLoading={decksLoading}
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
            {...itemProps.modelName}
            title="Model"
            storeValue={true}
            isLoading={modelsLoading}
          >
            {models?.map(model => (
              <Form.Dropdown.Item key={model.id} title={model.name} value={model.name} />
            ))}
          </Form.Dropdown>

          {fields}

          {show_draft_field && (
            <>
              <Form.Separator />
              <Form.TextArea
                id="draft"
                title="Draft / Notes"
                placeholder="Paste raw notes here. Use AI actions or 'Draft → Bullets' to process."
                value={draftText}
                onChange={setDraftText}
              />
            </>
          )}

          <Form.Separator />

          <Form.TagPicker {...itemProps.tags} title="Tags" ref={tagsCardRef}>
            {tags?.map(tag => <Form.TagPicker.Item key={tag} value={tag} title={tag} />)}
          </Form.TagPicker>
        </Form>
      )}
    </>
  );
}

function CardConfirmationDetail({
  deckName,
  modelName,
  fields,
  tags,
  noteId,
}: {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  tags: string[];
  noteId: number;
}) {
  const parts: string[] = [`# Card Added Successfully\n`];
  parts.push(`**Deck:** ${deckName}`);
  parts.push(`**Model:** ${modelName}`);
  parts.push(`**Note ID:** ${noteId}`);
  if (tags.length > 0) parts.push(`**Tags:** ${tags.join(', ')}`);
  parts.push('\n---\n');

  for (const [name, value] of Object.entries(fields)) {
    if (value) parts.push(`### ${name}\n${value}`);
  }

  return (
    <Detail
      navigationTitle="Card Confirmation"
      markdown={parts.join('\n')}
      actions={
        <ActionPanel>
          <Action
            title="Open in Anki"
            onAction={async () => {
              await guiActions.guiBrowse(`nid:${noteId}`);
            }}
          />
        </ActionPanel>
      }
    />
  );
}

function SessionHistoryList({ cards }: { cards: SessionCard[] }) {
  const reversed = [...cards].reverse();
  return (
    <List navigationTitle={`Session History (${cards.length} cards)`}>
      {reversed.map((card, idx) => (
        <List.Item
          key={`${card.noteId}-${idx}`}
          title={card.frontText || '(empty)'}
          subtitle={card.deckName}
          accessories={[
            { tag: card.modelName },
            ...card.tags.slice(0, 2).map(t => ({ tag: t })),
          ]}
          actions={
            <ActionPanel>
              <Action
                title="Open in Anki"
                onAction={async () => {
                  await guiActions.guiBrowse(`nid:${card.noteId}`);
                }}
              />
              <Action.CopyToClipboard title="Copy Front" content={card.frontText} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function ScoreDetailView({
  score,
  hasImprovement,
  onApplyImprovement,
}: {
  score: { score: number; grade: string; feedback: string[]; improvedCard?: Record<string, unknown> };
  hasImprovement: boolean;
  onApplyImprovement: () => void;
}) {
  const { pop } = useNavigation();
  const emoji = score.score >= 8 ? '🟢' : score.score >= 5 ? '🟡' : '🔴';

  const parts = [
    `# ${emoji} Card Quality: ${score.score}/10 — ${score.grade}\n`,
    '## Feedback',
    ...score.feedback.map(f => `- ${f}`),
  ];

  if (score.improvedCard) {
    parts.push('\n---\n');
    parts.push('## Suggested Improvement');
    const card = score.improvedCard;
    if (card.front) parts.push(`**Front:** ${card.front}`);
    if (card.back) parts.push(`**Back:** ${card.back}`);
    if (card.text) parts.push(`**Text:** ${card.text}`);
    if (card.extra) parts.push(`**Extra:** ${card.extra}`);
  }

  return (
    <Detail
      navigationTitle="Card Quality Score"
      markdown={parts.join('\n')}
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
          <Action title="Dismiss" onAction={pop} />
        </ActionPanel>
      }
    />
  );
}
