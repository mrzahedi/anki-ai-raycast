import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Form,
  getPreferenceValues,
  showToast,
  Toast,
} from '@raycast/api';
import noteActions from '../api/noteActions';
import { useCachedPromise, useForm } from '@raycast/utils';
import deckActions from '../api/deckActions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CreateCardFormValues, FieldRef, ShortcutDictionary } from '../types';
import modelActions from '../api/modelActions';
import React from 'react';
import { isValidFileType, transformSubmittedData, normalizeFormatting } from '../util';
import useErrorHandling from '../hooks/useErrorHandling';
import { useDefaults } from '../hooks/useDefaults';
import { TEMPLATES, getTemplateById, CardTemplate } from '../templates';

interface Props {
  deckName?: string;
}

export default function AddCardAction({ deckName }: Props) {
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

  const { allow_empty_card_fields, enable_attachments, show_field_hints, show_draft_field } =
    getPreferenceValues<Preferences.AddCard>();

  const { ai_enabled } = getPreferenceValues<Preferences>();

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

          await noteActions.addNote(createCardRequestBody);

          showToast({
            style: Toast.Style.Success,
            title: `Added new card to deck: ${values.deckName}`,
          });

          await persistDefaults(values.deckName, values.modelName);

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

  const handlePasteToFront = useCallback(async () => {
    if (!models || !values.modelName) return;
    const selectedModel = models.find(m => m.name === values.modelName);
    if (!selectedModel || selectedModel.flds.length < 1) return;
    const text = await Clipboard.readText();
    if (text) {
      const key = `field_${selectedModel.flds[0].name}`;
      setFieldValues(prev => ({ ...prev, [key]: text }));
    }
  }, [models, values]);

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
                  title="Clear Form"
                  shortcut={shortcuts.clearForm}
                  onAction={handleClearForm}
                />
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
                  title="Paste Clipboard Into Front"
                  shortcut={{ modifiers: ['cmd', 'shift'], key: 'v' }}
                  onAction={handlePasteToFront}
                />
                {show_draft_field && (
                  <Action
                    title="Draft to Bullets"
                    shortcut={{ modifiers: ['cmd', 'shift'], key: 'b' }}
                    onAction={handleDraftToBullets}
                  />
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
          navigationTitle="Add Card"
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
            {decks?.map(deck => (
              <Form.Dropdown.Item key={deck.deck_id} title={deck.name} value={deck.name} />
            ))}
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
