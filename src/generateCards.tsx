import {
  Action,
  ActionPanel,
  Color,
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
import { generateCardsFromDraft, scoreCards } from './ai';
import { AICard, AIResponse } from './ai/types';
import { CardScore } from './ai/scoring';
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
                showToast({ style: Toast.Style.Failure, title: 'Enter notes first' });
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
                const response = await generateCardsFromDraft(draftText, n);
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
      <Form.TextArea
        id="draft"
        title="Source Notes"
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
  const { push } = useNavigation();
  const { handleError } = useErrorHandling();
  const { data: models, isLoading: modelsLoading } = useCachedPromise(modelActions.getModels);
  const { data: decks, isLoading: decksLoading } = useCachedPromise(deckActions.getDecks);

  const { basic_model_name, cloze_model_name } = getPreferenceValues<Preferences>();
  const basicName = basic_model_name || 'Basic';
  const clozeName = cloze_model_name || 'Cloze';

  const [addedIndices, setAddedIndices] = useState<Set<number>>(new Set());
  const [scores, setScores] = useState<Record<number, CardScore>>({});
  const [isScoring, setIsScoring] = useState(false);

  const addCardToAnki = async (card: AICard, index: number): Promise<{ deckName: string } | null> => {
    if (!models) {
      showToast({ style: Toast.Style.Failure, title: 'Models not loaded yet' });
      return null;
    }

    const cardNoteType = card.noteType || response.selectedNoteType;
    const mapping = mapAICardToAnkiFields(
      card,
      cardNoteType,
      models,
      basicName,
      clozeName
    );

    if ('error' in mapping) {
      showToast({ style: Toast.Style.Failure, title: 'Cannot add card', message: mapping.error });
      return null;
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
      return { deckName };
    } catch (error) {
      handleError(error);
      return null;
    }
  };

  const addAllToAnki = async () => {
    let added = 0;
    const failures: string[] = [];
    const deckNames = new Set<string>();

    for (let i = 0; i < response.cards.length; i++) {
      if (addedIndices.has(i)) continue;
      const result = await addCardToAnki(response.cards[i], i);
      if (result) {
        added++;
        deckNames.add(result.deckName);
      } else {
        failures.push(`Card ${i + 1}`);
      }
    }

    showToast({ style: Toast.Style.Success, title: `Added ${added} cards to Anki` });

    push(
      <BulkAddSummary
        totalAdded={added}
        totalFailed={failures.length}
        failures={failures}
        deckNames={[...deckNames]}
        cards={response.cards.filter((_, i) => !addedIndices.has(i))}
      />
    );
  };

  const handleScoreAll = async () => {
    setIsScoring(true);
    try {
      await showToast({ style: Toast.Style.Animated, title: 'Scoring cards...' });
      const results = await scoreCards(response.cards, response.selectedNoteType);
      const scoreMap: Record<number, CardScore> = {};
      results.forEach((s, i) => {
        scoreMap[i] = s;
      });
      setScores(scoreMap);
      showToast({ style: Toast.Style.Success, title: 'Scoring complete' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      showToast({ style: Toast.Style.Failure, title: 'Scoring failed', message: msg.slice(0, 120) });
    } finally {
      setIsScoring(false);
    }
  };

  return (
    <List
      navigationTitle={`Generated ${response.cards.length} Cards`}
      isLoading={modelsLoading || decksLoading || isScoring}
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
          const cardNoteType = card.noteType || response.selectedNoteType;
          const cardScore = scores[index];

          const accessories: List.Item.Accessory[] = [
            { tag: cardNoteType },
            ...(card.tags || []).slice(0, 2).map(t => ({ tag: t })),
          ];

          if (cardScore) {
            const scoreColor =
              cardScore.score >= 8 ? Color.Green : cardScore.score >= 5 ? Color.Orange : Color.Red;
            accessories.unshift({ tag: { value: `${cardScore.score}/10`, color: scoreColor } });
          }

          return (
            <List.Item
              key={index}
              title={title}
              subtitle={preview.slice(0, 60)}
              accessories={accessories}
              detail={
                <List.Item.Detail
                  markdown={formatCardMarkdown(card, cardNoteType, cardScore)}
                />
              }
              actions={
                <ActionPanel>
                  {!isAdded && (
                    <Action title="Add to Anki" onAction={() => addCardToAnki(card, index)} />
                  )}
                  <Action title="Add All to Anki" onAction={addAllToAnki} />
                  <Action title="Score All Cards" onAction={handleScoreAll} />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}

function BulkAddSummary({
  totalAdded,
  totalFailed,
  failures,
  deckNames,
  cards,
}: {
  totalAdded: number;
  totalFailed: number;
  failures: string[];
  deckNames: string[];
  cards: AICard[];
}) {
  const parts: string[] = [];
  parts.push(`# Bulk Add Complete\n`);
  parts.push(`**Cards Added:** ${totalAdded}`);
  if (totalFailed > 0) parts.push(`**Failed:** ${totalFailed}`);
  parts.push(`**Deck(s):** ${deckNames.join(', ')}`);
  parts.push('\n---\n');

  parts.push('## Cards Added');
  cards.forEach((card, i) => {
    const label = card.front || card.text || '(empty)';
    const type = card.noteType || 'BASIC';
    parts.push(`${i + 1}. **[${type}]** ${label.slice(0, 80)}`);
  });

  if (failures.length > 0) {
    parts.push('\n---\n');
    parts.push('## Failed Cards');
    failures.forEach(f => parts.push(`- ${f}`));
  }

  return (
    <Detail
      navigationTitle="Bulk Add Summary"
      markdown={parts.join('\n')}
    />
  );
}

function formatCardMarkdown(card: AICard, noteType: string, score?: CardScore): string {
  const parts: string[] = [];

  if (noteType === 'BASIC') {
    if (card.front) parts.push(`## Front\n${card.front}`);
    if (card.back) parts.push(`## Back\n${card.back}`);
  } else {
    if (card.text) parts.push(`## Text (Cloze)\n${card.text}`);
  }

  if (card.extra) parts.push(`## Extra\n${card.extra}`);
  if (card.tags && card.tags.length > 0) parts.push(`**Tags:** ${card.tags.join(', ')}`);

  if (score) {
    const emoji = score.score >= 8 ? '🟢' : score.score >= 5 ? '🟡' : '🔴';
    parts.push(`\n---\n\n${emoji} **Quality: ${score.score}/10 — ${score.grade}**`);
    score.feedback.forEach(f => parts.push(`- ${f}`));
  }

  return parts.join('\n\n---\n\n');
}
