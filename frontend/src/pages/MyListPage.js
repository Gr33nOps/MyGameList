import React, { useState, useEffect } from 'react';
import { useAuth } from '../Context/AuthContext';
import { fetchUserGameList } from '../api';
import { jwtDecode } from 'jwt-decode';
import './MyListPage.css';

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

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed': return '#10b981';
      case 'playing': return '#3b82f6';
      case 'on-hold': return '#f59e0b';
      case 'dropped': return '#ef4444';
      case 'plan to play': return '#8b5cf6';
      default: return '#6b7280';
    }
  };

  const getStatusBadge = (status) => {
    return (
      <span 
        className="status-badge"
        style={{ backgroundColor: getStatusColor(status) }}
      >
        {status}
      </span>
    );
  };

  return (
    <div className="mylist-container">
      <div className="mylist-card">
        <h1 className="mylist-title">My Game Library</h1>
        
        {/* Debug Information */}
        {debugInfo && (
          <div className="debug-info">
            <strong>Debug:</strong> {debugInfo}
          </div>
        )}
        
        {error && (
          <div className="error-message">
            <div className="error-icon">⚠️</div>
            <p>{error}</p>
          </div>
        )}
        
        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading your games...</p>
          </div>
        ) : games.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🎮</div>
            <h2>Your game library is empty</h2>
            <p>Start building your collection by adding games from the Games page!</p>
            <div className="empty-suggestions">
              <p>You can track games you've:</p>
              <div className="suggestion-tags">
                <span className="suggestion-tag">Completed</span>
                <span className="suggestion-tag">Currently Playing</span>
                <span className="suggestion-tag">Want to Play</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="games-section">
            <div className="games-header">
              <h2>Your Games ({games.length})</h2>
              <div className="sort-options">
                {/* You can add sorting options here later */}
              </div>
            </div>
            
            <div className="games-grid">
              {games.map((game) => (
                <div key={game.list_entry_id} className="game-card">
                  <div className="game-header">
                    <h3 className="game-title">{game.title}</h3>
                    {getStatusBadge(game.status)}
                  </div>
                  
                  <div className="game-stats">
                    <div className="stat-item">
                      <span className="stat-label">Hours Played</span>
                      <span className="stat-value">{game.hours_played || 0}h</span>
                    </div>
                    
                    {game.score && (
                      <div className="stat-item">
                        <span className="stat-label">Your Score</span>
                        <span className="stat-value score">{game.score}/10</span>
                      </div>
                    )}
                    
                    <div className="stat-item">
                      <span className="stat-label">Added</span>
                      <span className="stat-value">
                        {new Date(game.date_added).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  
                  {game.review && (
                    <div className="game-review">
                      <div className="review-label">Your Review:</div>
                      <div className="review-text">"{game.review}"</div>
                    </div>
                  )}
                  
                  <div className="game-actions">
                    <button className="action-btn edit-btn">Edit</button>
                    <button className="action-btn remove-btn">Remove</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}