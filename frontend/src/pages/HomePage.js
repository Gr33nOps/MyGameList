// src/pages/HomePage.js
import { useEffect, useState } from 'react';
import { fetchGames } from '../api';
import GameCard from '../components/GameCard';

export default function HomePage() {
  const [games, setGames] = useState([]);

  useEffect(() => {
    fetchGames().then(setGames);
  }, []);

  return (
    <div>
      <h1>All Games</h1>
      <div className="grid">
        {games.map(game => (
          <GameCard
            key={game.game_id}
            title={game.title}
            description={game.description}
            coverUrl={game.cover_art_url}
          />
        ))}
      </div>
    </div>
  );
}
