import { createContext, useContext, useState, useEffect } from 'react';
import { setAuthToken } from '../api';
import { jwtDecode } from 'jwt-decode';  // <-- Named import fixed

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = () => {
      const token = localStorage.getItem('token');
      const email = localStorage.getItem('email');
      const name = localStorage.getItem('name');

      if (token) {
        try {
          const payload = jwtDecode(token);
          if (payload.exp * 1000 < Date.now()) {
            logout(); // Token expired
          } else {
            setAuthToken(token);
            setUser({ token, email, name });
          }
        } catch (err) {
          console.error('Invalid token:', err);
          logout();
        }
      }
      setLoading(false);
    };
    initializeAuth();
  }, []);

  const login = (token, email, name) => {
    localStorage.setItem('token', token);
    localStorage.setItem('email', email);
    localStorage.setItem('name', name);
    setAuthToken(token);
    setUser({ token, email, name });
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('email');
    localStorage.removeItem('name');
    setAuthToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);