// src/Context/AuthContext.js
import { createContext, useContext, useState, useEffect } from 'react';
import { login as apiLogin, setAuthToken } from '../api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setAuthToken(token);
      const payload = JSON.parse(atob(token.split('.')[1]));
      setUser({ id: payload.userId, email: payload.email });
    }
  }, []);

  const login = async (email, password) => {
    const token = await apiLogin(email, password);
    setAuthToken(token);
    const payload = JSON.parse(atob(token.split('.')[1]));
    setUser({ id: payload.userId, email: payload.email });
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setAuthToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
