import { createContext, useContext, useState, useEffect } from 'react';
import { setAuthToken } from '../api';
import { jwtDecode } from 'jwt-decode'; // Use named import

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const payload = jwtDecode(token);
          if (payload.exp * 1000 < Date.now()) {
            logout(); // Token expired
          } else {
            setAuthToken(token);
            setUser({ id: payload.userId, email: payload.email });
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

  const login = (token) => {
    localStorage.setItem('token', token);
    setAuthToken(token);
    const payload = jwtDecode(token);
    setUser({ id: payload.userId, email: payload.email });
  };

  const logout = () => {
    localStorage.removeItem('token');
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