import React, { useState, useEffect } from 'react';
import { BrowserRouter, HashRouter, Routes, Route } from 'react-router-dom';
import { io } from 'socket.io-client';
import LandingPage from './components/LandingPage';
import RoomPage from './components/RoomPage';
import './index.css';

// Connect to the backend dynamically
let backendUrl = import.meta.env.DEV ? `http://${window.location.hostname || 'localhost'}:5000` : '/';

if (window.location.protocol === 'file:') {
  // Desktop App connects to the live cloud server
  backendUrl = 'https://connect-world-r2tv.onrender.com'; 
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

  const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;

  return (
    <Router>
      <button className="theme-toggle-btn" onClick={toggleTheme}>
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      <Routes>
        <Route path="/" element={<LandingPage socket={socket} />} />
        <Route path="/room/:code" element={<RoomPage socket={socket} />} />
      </Routes>
    </Router>
  );
}

export default App;
