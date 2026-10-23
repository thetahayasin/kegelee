/** expo-apple-authentication: unavailable, as on Android. */
export const AppleAuthenticationButton = () => null;
export const AppleAuthenticationButtonStyle = { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 };
export const AppleAuthenticationButtonType = { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 };
export const AppleAuthenticationScope = { FULL_NAME: 0, FULL: 0, EMAIL: 1 };
export const formatFullName = () => '';
export const isAvailableAsync = async () => false;
export const signInAsync = async () => {
  throw new Error('Apple sign-in is unavailable');
};
