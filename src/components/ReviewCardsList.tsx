import {
  Action,
  ActionPanel,
  Color,
  Detail,
  Form,
  Icon,
  List,
  getPreferenceValues,
  showToast,
  Toast,
  useNavigation,
} from '@raycast/api';
import { useCachedPromise } from '@raycast/utils';
import { useEffect, useRef, useState } from 'react';
import { scoreCards } from '../ai';
import { AICard, AIResponse } from '../ai/types';
import { CardScore } from '../ai/scoring';
import { mapAICardToAnkiFields } from '../ai/fieldMapper';
import modelActions from '../api/modelActions';
import noteActions from '../api/noteActions';
import deckActions from '../api/deckActions';
import useErrorHandling from '../hooks/useErrorHandling';

interface ReviewCardsListProps {
  response: AIResponse;
  preSelectedDeck?: string;
  preSelectedTags?: string[];
}

export function ReviewCardsList({
  response,
  preSelectedDeck,
  preSelectedTags,
}: ReviewCardsListProps) {
  const { push, pop } = useNavigation();
  const { handleError } = useErrorHandling();
  const { data: models, isLoading: modelsLoading } = useCachedPromise(modelActions.getModels);
  const { data: decks, isLoading: decksLoading } = useCachedPromise(deckActions.getDecks);

  const { basic_model_name, cloze_model_name } = getPreferenceValues<Preferences>();
  const basicName = basic_model_name || 'Basic';
  const clozeName = cloze_model_name || 'Cloze';

  const [cards, setCards] = useState<AICard[]>(response.cards);
  const [addedIndices, setAddedIndices] = useState<Set<number>>(new Set());
  const [scores, setScores] = useState<Record<number, CardScore>>({});
  const [isScoring, setIsScoring] = useState(false);
  const [cardDecks, setCardDecks] = useState<Record<number, string>>({});
  const autoScored = useRef(false);

  const getDeckForCard = (card: AICard, index: number): string => {
    return cardDecks[index] || preSelectedDeck || card.deckName || decks?.[0]?.name || 'Default';
  };

  const handleScoreAll = async () => {
    setIsScoring(true);
    try {
      await showToast({ style: Toast.Style.Animated, title: 'Scoring cards...' });
      const results = await scoreCards(cards, response.selectedNoteType);
      const scoreMap: Record<number, CardScore> = {};
      results.forEach((s, i) => {
        scoreMap[i] = s;
      });
      setScores(scoreMap);
      showToast({ style: Toast.Style.Success, title: 'Scoring complete' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      showToast({
        style: Toast.Style.Failure,
        title: 'Scoring failed',
        message: msg.slice(0, 120),
      });
    } finally {
      setIsScoring(false);
    }
  };

  useEffect(() => {
    if (!modelsLoading && !decksLoading && !autoScored.current && cards.length > 0) {
      autoScored.current = true;
      handleScoreAll();
    }
  }, [modelsLoading, decksLoading]);

  const updateCard = (index: number, updated: AICard) => {
    setCards(prev => prev.map((c, i) => (i === index ? updated : c)));
  };

  const updateCardDeck = (index: number, deckName: string) => {
    setCardDecks(prev => ({ ...prev, [index]: deckName }));
  };

  const addCardToAnki = async (
    card: AICard,
    index: number
  ): Promise<{ deckName: string } | null> => {
    if (!models) {
      showToast({ style: Toast.Style.Failure, title: 'Models not loaded yet' });
      return null;
    }

    const cardNoteType = card.noteType || response.selectedNoteType;
    const mapping = mapAICardToAnkiFields(card, cardNoteType, models, basicName, clozeName);

    if ('error' in mapping) {
      showToast({ style: Toast.Style.Failure, title: 'Cannot add card', message: mapping.error });
      return null;
    }

    const deckName = getDeckForCard(card, index);
    const tags = [...new Set([...(preSelectedTags || []), ...(card.tags || [])])];

    try {
      await noteActions.addNote({
        deckName,
        modelName: mapping.modelName,
        fields: mapping.fields,
        tags,
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
    const deckNameSet = new Set<string>();

    for (let i = 0; i < cards.length; i++) {
      if (addedIndices.has(i)) continue;
      const result = await addCardToAnki(cards[i], i);
      if (result) {
        added++;
        deckNameSet.add(result.deckName);
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
        deckNames={[...deckNameSet]}
        cards={cards.filter((_, i) => !addedIndices.has(i))}
      />
    );
  };

  return (
    <List
      navigationTitle={`Generated ${cards.length} Cards`}
      isLoading={modelsLoading || decksLoading || isScoring}
      isShowingDetail
    >
      <List.Section
        title={`${response.selectedNoteType} Cards`}
        subtitle={response.notes ? response.notes.slice(0, 80) : undefined}
      >
        {cards.map((card, index) => {
          const isAdded = addedIndices.has(index);
          const preview = card.front || card.text || '';
          const title = preview
            ? `${isAdded ? '✓ ' : ''}${preview.slice(0, 60)}`
            : `${isAdded ? '✓ ' : ''}Card ${index + 1}`;
          const cardNoteType = card.noteType || response.selectedNoteType;
          const cardScore = scores[index];
          const deckName = getDeckForCard(card, index);

          const accessories: List.Item.Accessory[] = [];

          if (cardScore) {
            const scoreColor =
              cardScore.score >= 8 ? Color.Green : cardScore.score >= 5 ? Color.Orange : Color.Red;
            accessories.push({ tag: { value: `${cardScore.score}/10`, color: scoreColor } });
          }

          accessories.push({ tag: { value: cardNoteType, color: Color.Blue } });

          if (card.tags && card.tags.length > 0) {
            accessories.push(
              ...card.tags.slice(0, 2).map(t => ({ tag: t }))
            );
          }

          return (
            <List.Item
              key={index}
              title={title}
              subtitle={`#${index + 1} · ${deckName}`}
              keywords={[
                card.front || '',
                card.back || '',
                card.text || '',
                ...(card.tags || []),
              ].filter(Boolean)}
              accessories={accessories}
              detail={
                <List.Item.Detail
                  markdown={formatCardMarkdown(card, cardNoteType, deckName, cardScore)}
                />
              }
              actions={
                <ActionPanel>
                  <Action
                    title="Edit Card"
                    icon={Icon.Pencil}
                    onAction={() =>
                      push(
                        <EditCardForm
                          card={card}
                          index={index}
                          noteType={cardNoteType}
                          deckName={deckName}
                          decks={decks || []}
                          onSave={(updated, newDeck) => {
                            updateCard(index, updated);
                            updateCardDeck(index, newDeck);
                            pop();
                          }}
                        />
                      )
                    }
                  />
                  {!isAdded && (
                    <Action
                      title="Add to Anki"
                      icon={Icon.Plus}
                      onAction={() => addCardToAnki(card, index)}
                    />
                  )}
                  <Action
                    title="Add All to Anki"
                    icon={Icon.PlusCircle}
                    onAction={addAllToAnki}
                  />
                  <Action
                    title="Change Deck"
                    icon={Icon.Tray}
                    onAction={() =>
                      push(
                        <DeckPicker
                          decks={decks || []}
                          currentDeck={deckName}
                          onSelect={(selected) => {
                            updateCardDeck(index, selected);
                            pop();
                          }}
                        />
                      )
                    }
                  />
                  <Action
                    title="Score All Cards"
                    icon={Icon.Stars}
                    onAction={handleScoreAll}
                  />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}

/* ------------------------------------------------------------------ */
/*  Edit Card Form                                                     */
/* ------------------------------------------------------------------ */

interface EditCardFormProps {
  card: AICard;
  index: number;
  noteType: string;
  deckName: string;
  decks: { deck_id: number; name: string }[];
  onSave: (card: AICard, deckName: string) => void;
}

function EditCardForm({ card, index, noteType, deckName, decks, onSave }: EditCardFormProps) {
  return (
    <Form
      navigationTitle={`Edit Card ${index + 1}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Changes"
            onSubmit={(values: {
              front?: string;
              back?: string;
              text?: string;
              extra?: string;
              tags: string[];
              deckName: string;
            }) => {
              const updated: AICard = {
                ...card,
                front: values.front,
                back: values.back,
                text: values.text,
                extra: values.extra,
                tags: values.tags,
              };
              onSave(updated, values.deckName);
            }}
          />
        </ActionPanel>
      }
    >
      {noteType === 'BASIC' ? (
        <>
          <Form.TextArea id="front" title="Front" defaultValue={card.front || ''} />
          <Form.TextArea id="back" title="Back" defaultValue={card.back || ''} />
        </>
      ) : (
        <Form.TextArea id="text" title="Text (Cloze)" defaultValue={card.text || ''} />
      )}
      <Form.TextArea id="extra" title="Extra" defaultValue={card.extra || ''} />
      <Form.TagPicker id="tags" title="Tags" defaultValue={card.tags || []}>
        {(card.tags || []).map(tag => (
          <Form.TagPicker.Item key={tag} value={tag} title={tag} />
        ))}
      </Form.TagPicker>
      <Form.Dropdown id="deckName" title="Deck" defaultValue={deckName}>
        {decks.map(d => (
          <Form.Dropdown.Item key={d.deck_id} title={d.name} value={d.name} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}

/* ------------------------------------------------------------------ */
/*  Deck Picker                                                        */
/* ------------------------------------------------------------------ */

function DeckPicker({
  decks,
  currentDeck,
  onSelect,
}: {
  decks: { deck_id: number; name: string }[];
  currentDeck: string;
  onSelect: (deckName: string) => void;
}) {
  return (
    <List navigationTitle="Select Deck">
      {decks.map(deck => (
        <List.Item
          key={deck.deck_id}
          title={deck.name}
          icon={deck.name === currentDeck ? Icon.Checkmark : Icon.Tray}
          actions={
            <ActionPanel>
              <Action title="Select Deck" onAction={() => onSelect(deck.name)} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

/* ------------------------------------------------------------------ */
/*  Bulk Add Summary                                                   */
/* ------------------------------------------------------------------ */

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

  return <Detail navigationTitle="Bulk Add Summary" markdown={parts.join('\n')} />;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatCardMarkdown(
  card: AICard,
  noteType: string,
  deckName: string,
  score?: CardScore
): string {
  const parts: string[] = [];

  parts.push(`**Deck:** ${deckName}`);

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
