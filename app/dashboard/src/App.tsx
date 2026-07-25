import React, { useState } from 'react';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('dashboard_token'));

  if (!token) {
    return <Auth setToken={setToken} />;
  }

  return <Dashboard setToken={setToken} />;
}

export default App;
