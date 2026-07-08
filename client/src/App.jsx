import React, { useState, useEffect } from 'react';
import { BrowserRouter, HashRouter, Routes, Route } from 'react-router-dom';
import { io } from 'socket.io-client';
import LandingPage from './components/LandingPage';
import RoomPage from './components/RoomPage';
import './index.css';

// Connect to the backend dynamically
let backendUrl = import.meta.env.DEV 
  ? `http://${window.location.hostname || 'localhost'}:5000` 
  : 'https://connect-world-r2tv.onrender.com';

const socket = io(backendUrl);

function App() {
  const [theme, setTheme] = useState('dark');
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const Router = HashRouter;

  return (
    <Router>
      <button className="theme-toggle-btn" onClick={toggleTheme} title="Toggle Theme">
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      
      <button className="info-btn" onClick={() => setShowInfo(true)} title="About Developer">
        i
      </button>

      {showInfo && (
        <div className="info-modal-overlay" onClick={() => setShowInfo(false)}>
          <div className="info-modal-content" onClick={e => e.stopPropagation()}>
            <button className="info-modal-close" onClick={() => setShowInfo(false)}>✖</button>
            
            <div className="info-header">
              <h2>Aniket Pawar</h2>
              <p>B.Tech in Computer Science and Engineering (2022 - 2026)</p>
            </div>

            <div className="info-section">
              <h3>About Connect-World</h3>
              <p>
                Connect-World is a synchronized music listening platform that allows friends to join the same room, 
                queue up songs, and listen together in perfect real-time sync.
              </p>
              <div className="disclaimer">
                <strong>Disclaimer:</strong> This application was built strictly for educational and project purposes. 
                I do not claim copyright over any music or videos played through this platform. All content is streamed directly via YouTube's public API.
              </div>
            </div>

            <div className="info-section">
              <h3>Professional Summary</h3>
              <p>
                High-performing software engineer with a strong foundation in C, C++, and object-oriented design. 
                Proficient in applying modern software tools in Linux environments and collaborating within feature teams 
                to build scalable, high-performance system architectures.
              </p>
            </div>

            <div className="info-section">
              <h3>Experience</h3>
              <ul>
                <li><strong>Full-Stack Intern @ Infosys Springboard</strong> (Feb 2026 - Apr 2026)</li>
                <li><strong>Web-Development Intern @ Horizon Flare</strong> (Nov 2025 - Dec 2025)</li>
              </ul>
            </div>

            <div className="info-section">
              <h3>Let's Connect!</h3>
              <div className="info-links">
                <a href="https://aniket0102.github.io/portfolio-2026/" target="_blank" rel="noreferrer">Portfolio</a>
                <a href="https://www.linkedin.com/in/aniketpawar25/" target="_blank" rel="noreferrer">LinkedIn</a>
                <a href="https://github.com/ANIKET0102" target="_blank" rel="noreferrer">GitHub</a>
              </div>
            </div>

          </div>
        </div>
      )}

      <Routes>
        <Route path="/" element={<LandingPage socket={socket} />} />
        <Route path="/room/:code" element={<RoomPage socket={socket} />} />
      </Routes>
    </Router>
  );
}

export default App;
