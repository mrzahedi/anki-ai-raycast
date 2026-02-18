import {
  Action,
  ActionPanel,
  Detail,
  Form,
  getPreferenceValues,
  List,
  showToast,
  Toast,
  useNavigation,
} from '@raycast/api';
import { useCachedPromise } from '@raycast/utils';
import { useState } from 'react';
import { TEMPLATES, getTemplateById } from './templates';
import { generateCardsFromDraft } from './ai';
import { AICard, AIResponse } from './ai/types';
import { mapAICardToAnkiFields } from './ai/fieldMapper';
import modelActions from './api/modelActions';
import noteActions from './api/noteActions';
import deckActions from './api/deckActions';
import useErrorHandling from './hooks/useErrorHandling';

export default function GenerateCardsCommand() {
  const { ai_enabled } = getPreferenceValues<Preferences>();

  if (!ai_enabled) {
    return (
      <Detail markdown="# AI Not Enabled\n\nEnable AI Assist in Raycast Preferences → Anki to use this command." />
    );
  }

  return <GenerateCardsForm />;
}

function GenerateCardsForm() {
  const { push } = useNavigation();
  const [isGenerating, setIsGenerating] = useState(false);
  const [templateId, setTemplateId] = useState('none');
  const [draftText, setDraftText] = useState('');
  const [count, setCount] = useState('5');

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Generate Cards"
            onSubmit={async () => {
              if (!draftText.trim()) {
                showToast({ style: Toast.Style.Failure, title: 'Enter draft notes first' });
                return;
              }

              const n = parseInt(count, 10);
              if (isNaN(n) || n < 1 || n > 20) {
                showToast({ style: Toast.Style.Failure, title: 'Count must be 1-20' });
                return;
              }

              setIsGenerating(true);
              try {
                await showToast({ style: Toast.Style.Animated, title: 'Generating cards...' });
                const template = templateId !== 'none' ? getTemplateById(templateId) : undefined;
                const response = await generateCardsFromDraft(draftText, n, template);
                push(<ReviewCardsList response={response} />);
              } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                showToast({
                  style: Toast.Style.Failure,
                  title: 'Generation failed',
                  message: msg.slice(0, 120),
                });
              } finally {
                setIsGenerating(false);
              }
            }}
          />
        </ActionPanel>
      }
      navigationTitle="Generate Cards from Notes"
      isLoading={isGenerating}
    >
      <Form.Dropdown id="template" title="Template" value={templateId} onChange={setTemplateId}>
        <Form.Dropdown.Item key="none" title="Auto-detect" value="none" />
        {TEMPLATES.map(t => (
          <Form.Dropdown.Item key={t.id} title={t.name} value={t.id} />
        ))}
      </Form.Dropdown>

      <Form.TextArea
        id="draft"
        title="Draft / Notes"
        placeholder="Paste your raw notes, lecture content, or study material here..."
        value={draftText}
        onChange={setDraftText}
      />

      <Form.TextField
        id="count"
        title="Number of Cards"
        placeholder="5"
        value={count}
        onChange={setCount}
      />
    </Form>
  );
}

function ReviewCardsList({ response }: { response: AIResponse }) {
  const { handleError } = useErrorHandling();
  const { data: models, isLoading: modelsLoading } = useCachedPromise(modelActions.getModels);
  const { data: decks, isLoading: decksLoading } = useCachedPromise(deckActions.getDecks);

  const { basic_model_name, cloze_model_name } = getPreferenceValues<Preferences>();
  const basicName = basic_model_name || 'Basic';
  const clozeName = cloze_model_name || 'Cloze';

  const [addedIndices, setAddedIndices] = useState<Set<number>>(new Set());

  const addCardToAnki = async (card: AICard, index: number) => {
    if (!models) {
      showToast({ style: Toast.Style.Failure, title: 'Models not loaded yet' });
      return;
    }

    const mapping = mapAICardToAnkiFields(
      card,
      response.selectedNoteType,
      models,
      basicName,
      clozeName
    );

    if ('error' in mapping) {
      showToast({ style: Toast.Style.Failure, title: 'Cannot add card', message: mapping.error });
      return;
    }

    const deckName = card.deckName || decks?.[0]?.name || 'Default';

    try {
      await noteActions.addNote({
        deckName,
        modelName: mapping.modelName,
        fields: mapping.fields,
        tags: card.tags || [],
        audio: [],
        video: [],
        picture: [],
      });

      setAddedIndices(prev => new Set([...prev, index]));
      showToast({ style: Toast.Style.Success, title: `Card ${index + 1} added to ${deckName}` });
    } catch (error) {
      handleError(error);
    }
  };

  const addAllToAnki = async () => {
    let added = 0;
    for (let i = 0; i < response.cards.length; i++) {
      if (addedIndices.has(i)) continue;
      await addCardToAnki(response.cards[i], i);
      added++;
    }
    showToast({ style: Toast.Style.Success, title: `Added ${added} cards to Anki` });
  };

  return (
    <List
      navigationTitle={`Generated ${response.cards.length} Cards`}
      isLoading={modelsLoading || decksLoading}
      isShowingDetail
    >
      <List.Section
        title={`${response.selectedNoteType} Cards`}
        subtitle={response.notes ? response.notes.slice(0, 80) : undefined}
      >
        {response.cards.map((card, index) => {
          const isAdded = addedIndices.has(index);
          const preview = card.front || card.text || '(empty)';
          const title = `${isAdded ? '✓ ' : ''}Card ${index + 1}`;

          return (
            <List.Item
              key={index}
              title={title}
              subtitle={preview.slice(0, 60)}
              accessories={[
                { tag: response.selectedNoteType },
                ...(card.tags || []).slice(0, 2).map(t => ({ tag: t })),
              ]}
              detail={
                <List.Item.Detail markdown={formatCardMarkdown(card, response.selectedNoteType)} />
              }
              actions={
                <ActionPanel>
                  {!isAdded && (
                    <Action title="Add to Anki" onAction={() => addCardToAnki(card, index)} />
                  )}
                  <Action title="Add All to Anki" onAction={addAllToAnki} />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}

function formatCardMarkdown(card: AICard, noteType: string): string {
  const parts: string[] = [];

  if (noteType === 'BASIC') {
    if (card.front) parts.push(`## Front\n${card.front}`);
    if (card.back) parts.push(`## Back\n${card.back}`);
  } else {
    if (card.text) parts.push(`## Text (Cloze)\n${card.text}`);
  }

  if (card.extra) parts.push(`## Extra\n${card.extra}`);
  if (card.tags && card.tags.length > 0) parts.push(`**Tags:** ${card.tags.join(', ')}`);

  return parts.join('\n\n---\n\n');
}
