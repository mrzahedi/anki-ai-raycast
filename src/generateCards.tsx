import {
  Detail,
  Form,
  ActionPanel,
  Action,
  getPreferenceValues,
  showToast,
  Toast,
  useNavigation,
} from '@raycast/api';
import { useState } from 'react';
import { generateCardsFromDraft } from './ai';
import { ReviewCardsList } from './components/ReviewCardsList';

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
