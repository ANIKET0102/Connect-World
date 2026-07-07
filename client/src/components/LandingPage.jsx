import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './LandingPage.css';

function LandingPage({ socket }) {
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [showWelcome, setShowWelcome] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowWelcome(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    socket.on('room_created', (code) => {
      navigate(`/room/${code}`);
    });

    socket.on('room_joined', (room) => {
      navigate(`/room/${roomCode}`);
    });

    socket.on('error', (msg) => {
      setError(msg);
    });

    return () => {
      socket.off('room_created');
      socket.off('room_joined');
      socket.off('error');
    };
  }, [socket, navigate, roomCode]);

  const handleCreateRoom = () => {
    socket.emit('create_room');
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (roomCode.length === 6) {
      socket.emit('join_room', roomCode);
    } else {
      setError('Please enter a valid 6-digit code');
    }
  };

  return (
    <div className="landing-container">
      {showWelcome && (
        <div className="splash-screen">
          <div className="splash-content">
            <h1>MusicWorld</h1>
            <p>Sync your favorite songs perfectly with friends.</p>
          </div>
        </div>
      )}
      <div className="landing-content">
        <div className="landing-header">
          <h1 className="title">Music<span>World</span></h1>
          <p className="subtitle">Listen together, perfectly in sync, no matter where you are.</p>
        </div>

        <div className="cards-container">
          <div className="action-card create-card">
            <div className="card-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            </div>
            <h3>Create a Room</h3>
            <p>Create a new room and invite your friends to listen.</p>
            <button className="btn primary-btn" onClick={handleCreateRoom}>
              Generate Room Code
            </button>
          </div>

          <div className="action-card join-card">
            <div className="card-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>
            </div>
            <h3>Join a Friend</h3>
            <p>Enter a 6-digit code to jump into an existing room.</p>
            <form onSubmit={handleJoinRoom} className="join-form">
              <input
                type="text"
                placeholder="Code (e.g. 123456)"
                value={roomCode}
                onChange={(e) => {
                  setRoomCode(e.target.value.toUpperCase());
                  setError('');
                }}
                maxLength={6}
                className="code-input"
              />
              <button type="submit" className="btn secondary-btn">
                Join Room
              </button>
            </form>
            {error && <p className="error-msg">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LandingPage;
