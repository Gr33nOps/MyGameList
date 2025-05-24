
// src/api.js
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      delete api.defaults.headers.common['Authorization'];
      // Only redirect in browser environment
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const fetchGames = () =>
  api.get('/games').then((res) => {
    console.log('Fetched games:', res.data);
    res.data.forEach((game, index) => {
      if (!game.game_id || isNaN(game.game_id) || game.game_id <= 0) {
        console.warn(`Invalid game_id at index ${index}:`, game);
      }
    });
    return res.data;
  });

export const fetchUserGameList = async (userId, token) => {
  if (!token) {
    throw new Error('No authentication token provided');
  }
  setAuthToken(token);
  const response = await api.get(`/user-game-list/${userId}`);
  return response.data;
};

export const addGameToList = async (gameData, token) => {
  if (!token) {
    throw new Error('No authentication token provided');
  }
  setAuthToken(token);
  try {
    const response = await api.post('/user-game-list', gameData);
    return response.data;
  } catch (err) {
    const errorMsg = err.response?.data?.errors?.[0]?.msg || err.response?.data?.error || 'Failed to add game';
    throw new Error(errorMsg);
  }
};

export const login = async (email, password) => {
  try {
    const response = await api.post('/auth/login', { email, password });
    const { token, name } = response.data;
    localStorage.setItem('token', token);
    localStorage.setItem('email', email);
    if (name) localStorage.setItem('name', name);
    setAuthToken(token);
    return { token, email, name };
  } catch (err) {
    throw new Error(err.response?.data?.error || 'Login failed');
  }
};

export const signup = async (username, email, password) => {
  try {
    const response = await api.post('/auth/register', { username, email, password });
    return response.data;
  } catch (err) {
    throw new Error(err.response?.data?.error || 'Signup failed');
  }
};

export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

export default api;
