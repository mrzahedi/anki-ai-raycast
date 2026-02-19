import { LocalStorage } from '@raycast/api';
import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'anki_draft_state';
const DEBOUNCE_MS = 300;

export interface DraftState {
  draftText: string;
  fieldValues: Record<string, string>;
  selectedTemplate: string;
  deckName?: string;
  modelName?: string;
}

export function useDraftPersistence(
  current: DraftState
): {
  restoredState: DraftState | null;
  clearSavedDraft: () => Promise<void>;
} {
  const [restoredState, setRestoredState] = useState<DraftState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRestoredRef = useRef(false);

  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    (async () => {
      const saved = await LocalStorage.getItem<string>(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as DraftState;
          const hasContent =
            parsed.draftText?.trim() ||
            Object.values(parsed.fieldValues || {}).some(v => v?.trim());
          if (hasContent) {
            setRestoredState(parsed);
          }
        } catch {
          await LocalStorage.removeItem(STORAGE_KEY);
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (!hasRestoredRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const hasContent =
        current.draftText?.trim() ||
        Object.values(current.fieldValues || {}).some(v => v?.trim());
      if (hasContent) {
        await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [current.draftText, current.fieldValues, current.selectedTemplate, current.deckName, current.modelName]);

  const clearSavedDraft = async () => {
    await LocalStorage.removeItem(STORAGE_KEY);
    setRestoredState(null);
  };

  return { restoredState, clearSavedDraft };
}
