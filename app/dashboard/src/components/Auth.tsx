import React, { useState } from 'react';

export default function Auth({ setToken }: { setToken: (t: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'verify'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const host = import.meta.env.VITE_BACKEND_HOST || 'http://localhost:4000';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      if (mode === 'verify') {
        const res = await fetch(`${host}/api/auth/verify-2fa`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, code }),
        });
        const data = await res.json();
        if (res.ok) {
          localStorage.setItem('dashboard_token', data.token);
          setToken(data.token);
        } else {
          setError(data.error || 'Verification failed');
        }
        return;
      }

      const res = await fetch(`${host}/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      
      if (res.ok) {
        if (mode === 'register') {
          setMode('verify');
        } else {
          localStorage.setItem('dashboard_token', data.token);
          setToken(data.token);
        }
      } else {
        setError(data.error || 'Authentication failed');
      }
    } catch (err: any) {
      setError('Network error. Is the backend running?');
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#18181b] border border-zinc-800 rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">SigNoz Telemetry</h1>
          <p className="text-sm text-zinc-400">
            {mode === 'login' && 'Sign in to access your dashboard'}
            {mode === 'register' && 'Create an account'}
            {mode === 'verify' && 'Enter your 2FA verification code'}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-3 rounded-xl mb-6 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode !== 'verify' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Username</label>
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Password</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 transition-colors"
                  required
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">2FA Code</label>
              <input 
                type="text" 
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Check your server logs for the code"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 transition-colors"
                required
              />
            </div>
          )}

          <button 
            type="submit"
            className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-xl px-4 py-3 transition-colors mt-2"
          >
            {mode === 'login' ? 'Sign In' : mode === 'register' ? 'Register' : 'Verify & Continue'}
          </button>
        </form>

        {mode !== 'verify' && (
          <div className="mt-6 text-center text-sm text-zinc-500">
            {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
            <button 
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError('');
              }}
              className="text-amber-500 hover:text-amber-400 font-medium"
            >
              {mode === 'login' ? 'Register' : 'Sign In'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
