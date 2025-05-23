// src/components/GameCard.js
export default function GameCard({ title, description, coverUrl }) {
  return (
    <div className="card">
      <img src={coverUrl} alt={title} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}