import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { api } from '../src/services/api';
import { requestAppleAuthorization } from '../src/services/appleAuth';

jest.mock('../src/services/api', () => ({ api: {
  appleChallenge: jest.fn(), appleDeleteChallenge: jest.fn(),
} }));
jest.mock('../src/i18n', () => ({ __esModule: true, default: { t: (key: string) => key } }));

const challenge = { challenge_id: 'test-challenge', state: 's'.repeat(64), nonce: 'n'.repeat(64) };
const credential = { state: challenge.state, identityToken: 'signed-token', authorizationCode: 'one-time-code', fullName: null };
const originalOS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'ios';
  (AppleAuthentication.isAvailableAsync as jest.Mock).mockResolvedValue(true);
  (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue(credential);
  (api.appleChallenge as jest.Mock).mockResolvedValue({ ok: true, data: challenge });
  (api.appleDeleteChallenge as jest.Mock).mockResolvedValue({ ok: true, data: challenge });
});
afterAll(() => { Platform.OS = originalOS; });

test('binds the native request to the server nonce and returns both credentials', async () => {
  const result = await requestAppleAuthorization();
  expect(AppleAuthentication.signInAsync).toHaveBeenCalledWith(expect.objectContaining({ nonce: challenge.nonce, state: challenge.state }));
  expect(result).toEqual(expect.objectContaining({ challenge_id: challenge.challenge_id,
    state: challenge.state, identity_token: 'signed-token', authorization_code: 'one-time-code' }));
  expect(api.appleDeleteChallenge).not.toHaveBeenCalled();
});

test('deletion requests a challenge bound to the signed-in account', async () => {
  await requestAppleAuthorization('delete');
  expect(api.appleDeleteChallenge).toHaveBeenCalledTimes(1);
  expect(api.appleChallenge).not.toHaveBeenCalled();
});

test('cancellation quietly returns and releases the lock for the next attempt', async () => {
  (AppleAuthentication.signInAsync as jest.Mock).mockRejectedValueOnce({ code: 'ERR_REQUEST_CANCELED' });
  await expect(requestAppleAuthorization()).resolves.toBeNull();
  await expect(requestAppleAuthorization()).resolves.toMatchObject({ identity_token: 'signed-token' });
});

test.each([
  { ...credential, state: 'unsolicited-state' },
  { ...credential, identityToken: null },
  { ...credential, authorizationCode: null },
])('rejects mismatched state or missing credentials: %j', async value => {
  (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue(value);
  await expect(requestAppleAuthorization()).rejects.toThrow('login.appleSignInFailed');
});

test('a server failure stops before opening the Apple sheet', async () => {
  (api.appleChallenge as jest.Mock).mockResolvedValue({ ok: false, error: 'Try again later.' });
  await expect(requestAppleAuthorization()).rejects.toThrow('Try again later.');
  expect(AppleAuthentication.signInAsync).not.toHaveBeenCalled();
});

test('does not try Apple sign-in on Android', async () => {
  Platform.OS = 'android';
  await expect(requestAppleAuthorization()).rejects.toThrow('login.appleUnavailable');
  expect(api.appleChallenge).not.toHaveBeenCalled();
  expect(AppleAuthentication.signInAsync).not.toHaveBeenCalled();
});

test('prevents overlapping Apple authorization sheets', async () => {
  let resolve!: (value: typeof credential) => void;
  (AppleAuthentication.signInAsync as jest.Mock).mockReturnValue(new Promise(r => { resolve = r; }));
  const first = requestAppleAuthorization();
  await Promise.resolve();
  await Promise.resolve();
  await expect(requestAppleAuthorization()).resolves.toBeNull();
  resolve(credential);
  await first;
  expect(AppleAuthentication.signInAsync).toHaveBeenCalledTimes(1);
});
