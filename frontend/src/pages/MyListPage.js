// src/pages/MyListPage.js
import { useEffect, useState } from 'react';
import { fetchUserGameList } from '../api';
import UserGameList from '../components/UserGameList';

export default function MyListPage() {
  const [list, setList] = useState([]);
  const userId = 1; // hard-coded for now

  useEffect(() => {
    fetchUserGameList(userId).then(setList);
  }, []);

  return (
    <div>
      <h1>My Game List</h1>
      <UserGameList list={list} />
    </div>
  );
}
