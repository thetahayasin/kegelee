/** @react-native-google-signin/google-signin: never signed in. */
export const statusCodes = {
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  IN_PROGRESS: 'IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
};
export const isErrorWithCode = (e) => !!e && typeof e === 'object' && 'code' in e;
export const GoogleSignin = {
  configure: () => {},
  hasPlayServices: async () => true,
  signIn: async () => ({ type: 'cancelled', data: null }),
  signOut: async () => {},
  getTokens: async () => ({ idToken: null, accessToken: null }),
};
