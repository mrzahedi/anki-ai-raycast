import { LocalStorage } from '@raycast/api';
import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'anki_draft_state';
const DEBOUNCE_MS = 150;

export interface DraftState {
  draftText: string;
  fieldValues: Record<string, string>;
  deckName?: string;
  modelName?: string;
}

async function persistState(state: DraftState): Promise<void> {
  const hasContent =
    state.draftText?.trim() ||
    Object.values(state.fieldValues || {}).some(v => v?.trim());

  if (hasContent) {
    await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

export function useDraftPersistence(
  current: DraftState
): {
  restoredState: DraftState | null;
  clearSavedDraft: () => Promise<void>;
} {
  const [restoredState, setRestoredState] = useState<DraftState | null>(null);
  const hasRestoredRef = useRef(false);
  const latestStateRef = useRef(current);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  latestStateRef.current = current;

  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    void (async () => {
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
    timerRef.current = setTimeout(() => {
      void persistState(current);
    }, DEBOUNCE_MS);
  }, [current.draftText, current.fieldValues, current.deckName, current.modelName]);

  // Flush pending state on unmount so nothing is lost when closing (e.g. Esc)
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void persistState(latestStateRef.current);
    };
  }, []);

  const clearSavedDraft = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await LocalStorage.removeItem(STORAGE_KEY);
    setRestoredState(null);
  }, []);

  return { restoredState, clearSavedDraft };
}
