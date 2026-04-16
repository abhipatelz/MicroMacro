import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('mm_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => {
        localStorage.removeItem('mm_token');
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const d = await api('/auth/login', { method: 'POST', body: { email, password } });
    localStorage.setItem('mm_token', d.token);
    setUser(d.user);
    return d.user;
  }

  async function register(payload) {
    const d = await api('/auth/register', { method: 'POST', body: payload });
    localStorage.setItem('mm_token', d.token);
    setUser(d.user);
    return d.user;
  }

  function logout() {
    localStorage.removeItem('mm_token');
    setUser(null);
  }

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, register, setUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
