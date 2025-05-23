import React, { useState } from 'react';
import { signup } from '../api';
import { useNavigate } from 'react-router-dom';

export default function SignupPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await signup(username, email, password);
      alert('Signup successful! Please login.');
      navigate('/login');
    } catch (err) {
      alert('Signup failed. Try again.');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        placeholder="Username"
        value={username}
        onChange={e => setUsername(e.target.value)}
        required
      />
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        required
      />
      <button type="submit">Signup</button>
    </form>
  );
}
