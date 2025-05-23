import './GameCard.css'; // We'll create this CSS file

export default function GameCard({ title, description, coverUrl }) {
  return (
    <div className="game-card">
      <div className="game-card-image-wrapper">
        <img src={coverUrl} alt={title} className="game-card-image" />
      </div>
      <div className="game-card-content">
        <h3 className="game-card-title">{title}</h3>
        <p className="game-card-description">{description}</p>
      </div>
    </div>
  );
}