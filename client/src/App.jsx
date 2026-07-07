import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { io } from 'socket.io-client';
import LandingPage from './components/LandingPage';
import RoomPage from './components/RoomPage';
import './index.css';

// Connect to the backend dynamically
let backendUrl = import.meta.env.DEV ? `http://${window.location.hostname || 'localhost'}:5000` : '/';

if (window.location.protocol === 'file:') {
  // If running as a packaged desktop app, point to a hosted backend or localhost for testing
  backendUrl = 'http://localhost:5000'; 
}

const socket = io(backendUrl);

function App() {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  return (
    <BrowserRouter>
      <button className="theme-toggle-btn" onClick={toggleTheme}>
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      <Routes>
        <Route path="/" element={<LandingPage socket={socket} />} />
        <Route path="/room/:code" element={<RoomPage socket={socket} />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
