import { LocalStorage, getPreferenceValues } from '@raycast/api';
import { useEffect, useState } from 'react';

const STORAGE_KEYS = {
  lastDeck: 'anki_last_deck',
  lastModel: 'anki_last_model',
} as const;

interface Defaults {
  defaultDeck: string | undefined;
  defaultModel: string | undefined;
  defaultTags: string[];
  isLoading: boolean;
}

export function useDefaults(
  deckNameProp?: string
): Defaults & { persistDefaults: (deck: string, model: string) => Promise<void> } {
  const { default_deck, default_model, default_tags } = getPreferenceValues<Preferences>();
  const [storedDeck, setStoredDeck] = useState<string | undefined>();
  const [storedModel, setStoredModel] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [deck, model] = await Promise.all([
        LocalStorage.getItem<string>(STORAGE_KEYS.lastDeck),
        LocalStorage.getItem<string>(STORAGE_KEYS.lastModel),
      ]);
      setStoredDeck(deck);
      setStoredModel(model);
      setIsLoading(false);
    })();
  }, []);

  const persistDefaults = async (deck: string, model: string) => {
    await Promise.all([
      LocalStorage.setItem(STORAGE_KEYS.lastDeck, deck),
      LocalStorage.setItem(STORAGE_KEYS.lastModel, model),
    ]);
  };

  const parsedTags = default_tags
    ? default_tags
        .split(',')
        .map((t: string) => t.trim())
        .filter(Boolean)
    : [];

  return {
    defaultDeck: deckNameProp || default_deck || storedDeck,
    defaultModel: default_model || storedModel,
    defaultTags: parsedTags,
    isLoading,
    persistDefaults,
  };
}
