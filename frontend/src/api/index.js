import axios from 'axios';

// Fetch all games
export const fetchGames = () =>
  axios.get('/api/games').then(res => res.data);

// Fetch a user’s game list
export const fetchUserGameList = (userId) =>
  axios.get(`/api/user-game-list/${userId}`).then(res => res.data);