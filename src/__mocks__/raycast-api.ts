// Minimal mock for @raycast/api so pure-logic modules can be imported in tests
export const getPreferenceValues = () => ({});
export const showToast = async () => {};
export const showHUD = async () => {};
export const Toast = { Style: { Success: 'success', Failure: 'failure', Animated: 'animated' } };
export const Color = { Blue: 'blue', Red: 'red', Green: 'green', SecondaryText: 'secondary' };
export const List = { Item: { Accessory: {} } };
export const Form = {};
export const Keyboard = {};
export const Clipboard = { copy: async () => {}, readText: async () => '' };
const store: Record<string, string> = {};
export const LocalStorage = {
  getItem: async (key: string) => store[key],
  setItem: async (key: string, value: string) => { store[key] = value; },
  removeItem: async (key: string) => { delete store[key]; },
  allItems: async () => ({ ...store }),
  clear: async () => { Object.keys(store).forEach(k => delete store[k]); },
};
export const useNavigation = () => ({ push: () => {}, pop: () => {} });
export const useCachedPromise = () => ({ data: undefined, isLoading: false, error: undefined });
