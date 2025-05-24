import React, { useState, useEffect } from 'react';
import { useAuth } from '../Context/AuthContext';
import { fetchUserGameList } from '../api';
import { jwtDecode } from 'jwt-decode';

export default function MyListPage() {
  const { user } = useAuth();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState('');

  useEffect(() => {
    const fetchGames = async () => {
      if (!user || !user.token) {
        setError('Please log in to view your game list.');
        setLoading(false);
        return;
      }

      try {
        const decoded = jwtDecode(user.token);
        console.log('Decoded JWT:', decoded);
        const userId = decoded.id;
        console.log('Fetching games for userId:', userId, 'type:', typeof userId);
        
        // Add debug info
        setDebugInfo(`User ID: ${userId}, Token exists: ${!!user.token}`);
        
        if (!userId || isNaN(userId) || userId <= 0) {
          throw new Error('Invalid user ID');
        }
        
        console.log('About to call fetchUserGameList with:', { userId, hasToken: !!user.token });
        const data = await fetchUserGameList(userId, user.token);
        console.log('MyListPage: Fetched user games:', data);
        console.log('Data type:', typeof data, 'Is array:', Array.isArray(data), 'Length:', data?.length);
        
        // Ensure data is an array
        const gamesList = Array.isArray(data) ? data : [];
        setGames(gamesList);
        setLoading(false);
      } catch (err) {
        console.error('MyListPage: Error fetching user games:', err);
        console.log('Error details:', {
          message: err.message,
          response: err.response?.data,
          status: err.response?.status,
          stack: err.stack
        });
        
        setError(
          err.response?.data?.error ||
          err.response?.data?.errors?.[0]?.msg ||
          err.message ||
          'Failed to load your game list.'
        );
        setLoading(false);
      }
    };

    fetchGames();
  }, [user]);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-4">My Game List</h1>
      
      {/* Debug Information */}
      {debugInfo && (
        <div className="bg-gray-100 p-2 mb-4 rounded text-sm">
          <strong>Debug:</strong> {debugInfo}
        </div>
      )}
      
      {error && <p className="text-red-500 mb-4">{error}</p>}
      
      {loading ? (
        <p>Loading games...</p>
      ) : games.length === 0 ? (
        <div>
          <p>No games in your list yet.</p>
          <p className="text-sm text-gray-500 mt-2">
            Try adding some games from the Games page first.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {games.map((game) => (
            <li key={game.list_entry_id} className="p-2 border rounded">
              <div className="font-semibold">{game.title}</div>
              <div className="text-sm text-gray-600">
                Status: {game.status} | Hours: {game.hours_played || 0} | 
                {game.score && ` Score: ${game.score}/10 |`}
                Added: {new Date(game.date_added).toLocaleDateString()}
              </div>
              {game.review && (
                <div className="text-sm mt-1 italic">"{game.review}"</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}