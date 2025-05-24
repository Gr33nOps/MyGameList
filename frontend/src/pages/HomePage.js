import { useEffect, useState } from 'react';
import { fetchGames } from '../api';
import GameCard from '../components/GameCard';
import './HomePage.css';  // new CSS file

export default function HomePage() {
  const [games, setGames] = useState([]);

  useEffect(() => {
    fetchGames().then(setGames);
  }, []);

  return (
    <div className="home-container">
      <div className="home-card">
        <h1 className="home-title">All Games</h1>
        <div className="grid">
          {games.map(game => (
            <GameCard
              key={game.game_id}
              game_id={game.game_id}
              title={game.title}
              description={game.description}
              coverUrl={game.cover_art_url}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
