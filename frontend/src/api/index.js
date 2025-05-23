// src/api/index.js
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const fetchGames = () =>
  api.get('/games').then(res => res.data);

export const fetchUserGameList = (userId) =>
  api.get(`/user-game-list/${userId}`).then(res => res.data);

export const login = async (email, password) => {
  const response = await api.post('/auth/login', { email, password });
  const token = response.data.token;
  localStorage.setItem('token', token);
  return token;
};

export const signup = async (username, email, password) => {
  const response = await api.post('/auth/register', { username, email, password });
  return response.data;
};

export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

export default api;
