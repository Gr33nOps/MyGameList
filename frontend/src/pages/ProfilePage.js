import React from 'react';
import { useAuth } from '../Context/AuthContext';

export default function ProfilePage() {
  const { user } = useAuth(); // ✅ use the custom hook directly

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold">Profile</h1>
      <p>Email: {user?.email || 'N/A'}</p>
      <p>Name: {user?.name || 'N/A'}</p>
    </div>
  );
}
