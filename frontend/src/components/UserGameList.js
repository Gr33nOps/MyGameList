// src/components/UserGameList.js
export default function UserGameList({ list }) {
  return (
    <ul>
      {list.map(item => (
        <li key={item.title}>
          {item.title} — {item.status} ({item.hours_played} hrs)
        </li>
      ))}
    </ul>
  );
}
