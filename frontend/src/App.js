// src/App.js
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import HomePage from './pages/HomePage';
import MyListPage from './pages/MyListPage';

export default function App() {
  return (
    <BrowserRouter>
      <nav>
        <Link to="/">Home</Link> | <Link to="/my-list">My List</Link>
      </nav>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/my-list" element={<MyListPage />} />
      </Routes>
    </BrowserRouter>
  );
}
