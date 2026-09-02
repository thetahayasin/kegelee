/**
 * @format
 *
 * The transport layer: the rotated token, and the stable failure keys.
 *
 * Changing a password invalidates every session including this device's own,
 * and the backend hands back a replacement in the same response. Missing it is
 * not a small bug: the next request 401s, sync raises an auth failure, and
 * AuthContext logs the user out for successfully changing their password.
 */

jest.mock('../src/db/queries', () => ({
  saveDBUser: jest.fn(async () => {}),
}));

// i18next is not initialised in this suite, and every message here is only
// read for logs. The key back is enough to assert on.
jest.mock('../src/i18n', () => ({
  __esModule: true,
  default: { t: (k: string) => k, language: 'en' },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveDBUser } from '../src/db/queries';
import { api, setApiToken } from '../src/services/api';

const jsonResponse = (status: number, body: any) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
});

const fetchMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (global as any).fetch = fetchMock;
  setApiToken('old-token');
});

describe('changePassword token rotation', () => {
  it('adopts the new token everywhere before it resolves', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { success: true, api_token: 'new-token', password_hash: 'x' }),
    );

    const res = await api.changePassword({ current_password: 'a', password: 'b' });
    expect(res.ok).toBe(true);

    // AsyncStorage, for the next cold start.
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@api_token', 'new-token');
    // The users row, which the bootstrap and the sync both read.
    expect(saveDBUser).toHaveBeenCalledWith({ api_token: 'new-token' });

    // And in memory: the very next request must already carry it.
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
    await api.pullState();
    const headers = fetchMock.mock.calls[1][1].headers;
    expect(headers['X-User-Token']).toBe('new-token');
  });

  it('accepts the token nested under user, which is the other payload shape', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { success: true, user: { api_token: 'nested-token' } }),
    );
    await api.changePassword({});
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@api_token', 'nested-token');
  });

  it('does nothing when the response carries no new token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true }));
    await api.changePassword({});
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(saveDBUser).not.toHaveBeenCalled();
  });

  it('does not rotate on a failed change', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(422, { error: 'wrong password', api_token: 'should-not-be-used' }),
    );
    const res = await api.changePassword({});
    expect(res.ok).toBe(false);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('still reports success if the token could not be persisted', async () => {
    // A storage failure must not turn a password change that DID happen into
    // an error the screen shows.
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true, api_token: 'new-token' }));
    const res = await api.changePassword({});
    expect(res.ok).toBe(true);
    expect(saveDBUser).toHaveBeenCalledWith({ api_token: 'new-token' });
  });
});

describe('errorKey', () => {
  it('reports a request that never landed as network', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    const res = await api.pullState();
    expect(res.errorKey).toBe('network');
    expect(res.status).toBe(0);
    // The raw message is still there for logs.
    expect(res.error).toBe('Network request failed');
  });

  it('reports an abort as network too', async () => {
    const abort = new Error('Aborted');
    abort.name = 'AbortError';
    fetchMock.mockRejectedValueOnce(abort);
    const res = await api.pullState();
    expect(res.errorKey).toBe('network');
  });

  it('reports a 5xx as server', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: 'boom' }));
    expect((await api.pullState()).errorKey).toBe('server');
  });

  it('reports an unreadable body as server', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, text: async () => '<html>502</html>' });
    expect((await api.pullState()).errorKey).toBe('server');
  });

  it('leaves a 4xx as unknown, because its own message is the useful one', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(422, { error: 'The email has already been taken' }));
    const res = await api.pullState();
    expect(res.errorKey).toBe('unknown');
    expect(res.error).toBe('The email has already been taken');
  });

  it('sets no key at all on success', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: 1 }));
    expect((await api.pullState()).errorKey).toBeUndefined();
  });
});
