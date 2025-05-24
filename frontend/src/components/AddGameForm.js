// src/components/AddGameForm.js
import { useState } from 'react';
import { useAuth } from '../Context/AuthContext';
import { addGameToList } from '../api';

export default function AddGameForm({ gameId, onClose, onSuccess }) {
  const { user } = useAuth();
  const [status, setStatus] = useState('playing');
  const [score, setScore] = useState(''); // Initialize as empty string
  const [review, setReview] = useState(''); // Initialize as empty string
  const [hoursPlayed, setHoursPlayed] = useState(''); // Initialize as empty string
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  if (!gameId || isNaN(gameId) || gameId <= 0) {
    return <div className="text-red-500">Error: Invalid game ID</div>;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Ensure fields are sent as null if empty
    const requestData = {
      game_id: gameId,
      status,
      score: score ? parseInt(score) : null,
      review: review || null, // Empty string becomes null
      hours_played: hoursPlayed ? parseInt(hoursPlayed) : null,
    };

    console.log('Sending request:', requestData);

    try {
      await addGameToList(requestData, user.token);
      setSuccess('Game added to your list!');
      onSuccess();
      setTimeout(onClose, 1000);
    } catch (err) {
      console.error('Add game error:', err);
      setError(err.message || 'Failed to add game');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
        <h3 className="text-lg font-semibold mb-4">Add Game to Your List</h3>
        {error && <p className="text-red-500 mb-4">{error}</p>}
        {success && <p className="text-green-500 mb-4">{success}</p>}

        <div className="mb-4 p-2 bg-gray-100 rounded text-xs">
          <p><strong>Debug Info:</strong></p>
          <p>Game ID: {gameId} (type: {typeof gameId})</p>
          <p>Has Token: {user?.token ? 'Yes' : 'No'}</p>
          <p>Review: "{review}" (type: {typeof review})</p>
          <p>Score: "{score}" (type: {typeof score})</p>
          <p>Hours Played: "{hoursPlayed}" (type: {typeof hoursPlayed})</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full p-2 border rounded"
            >
              <option value="playing">Playing</option>
              <option value="completed">Completed</option>
              <option value="dropped">Dropped</option>
              <option value="plan_to_play">Plan to Play</option>
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 mb-1">Score (0-10, optional)</label>
            <input
              type="number"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              min="0"
              max="10"
              className="w-full p-2 border rounded"
              placeholder="Enter score (0-10)"
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 mb-1">Review (optional)</label>
            <textarea
              value={review}
              onChange={(e) => setReview(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="Write your review"
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 mb-1">Hours Played (optional)</label>
            <input
              type="number"
              value={hoursPlayed}
              onChange={(e) => setHoursPlayed(e.target.value)}
              min="0"
              className="w-full p-2 border rounded"
              placeholder="Enter hours played"
            />
          </div>
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
