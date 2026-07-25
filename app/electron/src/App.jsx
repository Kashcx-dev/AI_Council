import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ChatInterface from './components/ChatInterface';
import Login from './components/Login';
import GoldfishState from './Context/GoldfishState';

function App() {
  return (
    <GoldfishState>
      <Router>
        <Routes>
          <Route path="/" element={<ChatInterface />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={
            <div className="flex h-screen items-center justify-center bg-[#09090b] text-white">
               <div className="text-center space-y-4 max-w-sm p-8 bg-[#18181b] rounded-3xl border border-zinc-800">
                  <h1 className="text-2xl font-bold">Account Required</h1>
                  <p className="text-zinc-400 text-sm">Please visit the Violet web dashboard in your browser to create a new account.</p>
                  <button onClick={() => window.location.hash = "/"} className="w-full mt-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-xl transition">Return to App</button>
               </div>
            </div>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </GoldfishState>
  );
}

export default App;
