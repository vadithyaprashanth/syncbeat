import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  timeout: 30000,
});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('sb_token');
    const storedUser = localStorage.getItem('sb_user');
    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setToken(storedToken);
        setUser(parsedUser);
        api.get('/auth/me', {
          headers: { Authorization: `Bearer ${storedToken}` }
        })
          .then((res) => setUser(res.data.user))
          .catch(() => {
            localStorage.removeItem('sb_token');
            localStorage.removeItem('sb_user');
            setUser(null);
            setToken(null);
          })
          .finally(() => setLoading(false));
      } catch (e) {
        localStorage.removeItem('sb_token');
        localStorage.removeItem('sb_user');
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  const login = (userData, userToken) => {
    setUser(userData);
    setToken(userToken);
    localStorage.setItem('sb_token', userToken);
    localStorage.setItem('sb_user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('sb_token');
    localStorage.removeItem('sb_user');
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};