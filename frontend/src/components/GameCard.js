// src/components/GameCard.js
import { useState, useEffect } from 'react';
import { useAuth } from '../Context/AuthContext';
import AddGameForm from './AddGameForm';
import './GameCard.css';

export default function GameCard({ game_id, title, description, coverUrl }) {
  const { user } = useAuth();
  const [showAddForm, setShowAddForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      setIsLoading(true);
      await new Promise((resolve) => setTimeout(resolve, 100));
      setIsLoading(false);
    };
    checkUser();
  }, [user]);

  // Debug: Log props
  console.log('GameCard received props:', { game_id, title, description, coverUrl });
  console.log('game_id type:', typeof game_id, 'value:', game_id);

  // Validate game_id
  const parsedGameId = parseInt(game_id);
  if (isNaN(parsedGameId) || parsedGameId <= 0) {
    console.error('Invalid game_id:', game_id);
    return <div className="text-red-500 text-sm">Error: Invalid game ID</div>;
  }

  if (isLoading) {
    return <div className="text-gray-500 text-sm">Loading...</div>;
  }

  return (
    <div className="bg-white p-4 rounded-lg shadow-md flex flex-col space-y-2">
      <div className="game-card-image-wrapper">
        <img
          src={coverUrl}
          alt={title}
          className="w-full h-48 object-cover rounded game-card-image"
        />
      </div>
      <div className="game-card-content">
        <h3 className="text-lg font-semibold game-card-title">{title}</h3>
        <p className="text-gray-600 text-sm game-card-description">{description}</p>
      </div>
      {user && user.token ? (
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Add to List
        </button>
      ) : (
        <p className="text-gray-500 text-sm">Log in to add to your list</p>
      )}
      {showAddForm && (
        <AddGameForm
          gameId={parsedGameId}
          onClose={() => setShowAddForm(false)}
          onSuccess={() => setShowAddForm(false)}
        />
      )}
    </div>
  );
}