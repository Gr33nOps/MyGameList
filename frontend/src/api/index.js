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
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const fetchGames = () => api.get('/games').then((res) => res.data);

export const fetchUserGameList = (userId) =>
  api.get(`/user-game-list/${userId}`).then((res) => res.data);

export const login = async (email, password) => {
  try {
    const response = await api.post('/auth/login', { email, password });
    const token = response.data.token;
    localStorage.setItem('token', token);
    setAuthToken(token);
    return token;
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