import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../services/api.js';

const AuthContext = createContext(null);

/**
 * Authentication Context Provider managing user registration, login, logout,
 * and automatic session validation on initial load.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      const token = localStorage.getItem('token');
      if (token) {
        api.setToken(token);
        try {
          const res = await api.get('/auth/me');
          setUser(res.user);
        } catch (err) {
          api.setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    }
    loadUser();
  }, []);

  const loginUser = async (loginId, password) => {
    setLoading(true);
    try {
      const data = await api.post('/auth/login', { login: loginId, password });
      api.setToken(data.token);
      setUser(data.user);
      return data.user;
    } catch (err) {
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const registerUser = async (username, email, password) => {
    setLoading(true);
    try {
      const data = await api.post('/auth/register', { username, email, password });
      api.setToken(data.token);
      setUser(data.user);
      return data.user;
    } catch (err) {
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logoutUser = () => {
    api.setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginUser, registerUser, logoutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
