// Minimal mock for @raycast/api so pure-logic modules can be imported in tests
export const getPreferenceValues = () => ({});
export const showToast = async () => {};
export const Toast = { Style: { Success: 'success', Failure: 'failure', Animated: 'animated' } };
export const Color = { Blue: 'blue', Red: 'red', Green: 'green', SecondaryText: 'secondary' };
export const List = { Item: { Accessory: {} } };
export const Form = {};
export const Keyboard = {};
