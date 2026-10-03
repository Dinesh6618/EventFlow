import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api';
import { setUnauthorizedHandler, tokenStore } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // True until we know whether a stored token still maps to a real user.
  const [loading, setLoading] = useState(() => Boolean(tokenStore.get()));

  const signOut = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(signOut);
    if (!tokenStore.get()) return undefined;

    const controller = new AbortController();
    authApi
      .me(controller.signal)
      .then(({ user: me }) => setUser(me))
      .catch((err) => {
        // The client already ends the session on a 401 or an unverified account. Anything else (a busy
        // server, a lost connection) says nothing about the session, so the stored login is kept.
        if (err.name !== 'AbortError' && (err.status === 401 || err.code === 'EMAIL_NOT_VERIFIED')) signOut();
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [signOut]);

  const startSession = useCallback(({ user: next, token }) => {
    tokenStore.set(token);
    setUser(next);
    return next;
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login: async (credentials) => startSession(await authApi.login(credentials)),
      // Where the email must be verified first there is no session yet: the result says so instead.
      register: async (details) => {
        const result = await authApi.register(details);
        if (result.token) startSession(result);
        return result;
      },
      logout: signOut,
      setUser,
    }),
    [user, loading, startSession, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
