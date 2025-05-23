// src/components/NavBar.js
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../Context/AuthContext'; // ✅ Only use useAuth

export default function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav style={styles.nav}>
      <div style={styles.logo}>🎮 GameList</div>
      <div style={styles.links}>
        <Link style={styles.link} to="/">Home</Link>
        <Link style={styles.link} to="/my-list">My List</Link>
        {user ? (
          <>
            <Link style={styles.link} to="/profile">Profile</Link>
            <button style={styles.button} onClick={handleLogout}>Logout</button>
          </>
        ) : (
          <>
            <Link style={styles.link} to="/login">Login</Link>
            <Link style={styles.link} to="/signup">Signup</Link>
          </>
        )}
      </div>
    </nav>
  );
}

const styles = {
  nav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 20px',
    backgroundColor: '#222',
    color: 'white',
  },
  logo: {
    fontSize: '1.2rem',
    fontWeight: 'bold',
  },
  links: {
    display: 'flex',
    gap: '15px',
    alignItems: 'center',
  },
  link: {
    color: 'white',
    textDecoration: 'none',
    fontWeight: 'bold',
  },
  button: {
    backgroundColor: '#ff4d4f',
    color: 'white',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
  },
};