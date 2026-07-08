import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import YouTube from 'react-youtube';
import './RoomPage.css';

function RoomPage({ socket }) {
  const { code } = useParams();
  const navigate = useNavigate();
  const [videoId, setVideoId] = useState(''); // Default empty until fetched
  const [player, setPlayer] = useState(null);
  const playerRef = useRef(null);
  const [initialSync, setInitialSync] = useState(null);
  const [queue, setQueue] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Chat state
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef(null);
  const [draggedItemIdx, setDraggedItemIdx] = useState(null);
  const [draggedOverItemIdx, setDraggedOverItemIdx] = useState(null);
  const lastTimeRef = useRef(0);
  const [copied, setCopied] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Use a ref to prevent infinite loops of socket events
  const isSyncing = useRef(false);

  const exitRoom = () => {
    navigate('/');
  };

  useEffect(() => {
    if (!socket) return;
    
    // Fetch room state in case of refresh
    socket.emit('get_room_state', { roomCode: code });

    socket.on('room_state_sync', (room) => {
      if (room.videoId) setVideoId(room.videoId);
      setQueue(room.queue || []);
      setMessages(room.messages || []);
      
      let calcTime = room.currentTime;
      if (room.isPlaying && room.lastUpdateTime) {
         calcTime += (Date.now() - room.lastUpdateTime) / 1000;
      }
      
      if (playerRef.current) {
         isSyncing.current = true;
         playerRef.current.seekTo(calcTime);
         if (room.isPlaying) playerRef.current.playVideo();
         else playerRef.current.pauseVideo();
         setTimeout(() => { isSyncing.current = false; }, 500);
      } else {
         setInitialSync({ currentTime: calcTime, isPlaying: room.isPlaying });
      }
    });

    socket.on('search_results', (results) => {
      setSearchResults(results);
      setIsSearching(false);
    });

    socket.on('queue_updated', (updatedQueue) => {
      setQueue(updatedQueue);
    });

    socket.on('new_message', (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    socket.on('error', (err) => {
      if (err && typeof err === 'object') {
        if (err.type === 'NOT_FOUND') {
          alert(err.message);
          navigate('/');
        }
      }
    });

    return () => {
      socket.off('room_state_sync');
      socket.off('search_results');
      socket.off('queue_updated');
      socket.off('new_message');
      socket.off('error');
    };
  }, [socket, code, navigate]);

  useEffect(() => {
    if (!socket || !player) return;

    const handlePlay = (data) => {
      isSyncing.current = true;
      if (Math.abs(player.getCurrentTime() - data.currentTime) > 1) {
        player.seekTo(data.currentTime);
      }
      player.playVideo();
      setTimeout(() => { isSyncing.current = false; }, 500);
    };

    const handlePause = (data) => {
      isSyncing.current = true;
      player.pauseVideo();
      player.seekTo(data.currentTime);
      setTimeout(() => { isSyncing.current = false; }, 500);
    };

    const handleSeek = (data) => {
      isSyncing.current = true;
      player.seekTo(data.currentTime);
      setTimeout(() => { isSyncing.current = false; }, 500);
    };

    socket.on('play', handlePlay);
    socket.on('pause', handlePause);
    socket.on('seek', handleSeek);

    return () => {
      socket.off('play', handlePlay);
      socket.off('pause', handlePause);
      socket.off('seek', handleSeek);
    };
  }, [socket, player]);

  // Polling to detect manual seeks (especially when paused)
  useEffect(() => {
    if (!player || !socket) return;

    const interval = setInterval(() => {
      if (isSyncing.current) {
        lastTimeRef.current = player.getCurrentTime();
        return;
      }

      const currentTime = player.getCurrentTime();
      const state = player.getPlayerState();
      const lastTime = lastTimeRef.current;

      // Detect seek while paused
      if (state === 2) {
        if (Math.abs(currentTime - lastTime) > 1.0) {
          socket.emit('seek', { roomCode: code, currentTime });
        }
      } 
      // Detect seek while playing (expected time change ~1s)
      else if (state === 1) {
        const diff = Math.abs(currentTime - lastTime - 1.0);
        if (diff > 2.0) { 
          socket.emit('seek', { roomCode: code, currentTime });
        }
      }

      lastTimeRef.current = currentTime;
    }, 1000);

    return () => clearInterval(interval);
  }, [player, socket, code]);

  const onReady = (event) => {
    setPlayer(event.target);
    playerRef.current = event.target;
    
    if (initialSync) {
      isSyncing.current = true;
      event.target.seekTo(initialSync.currentTime);
      if (initialSync.isPlaying) {
        event.target.playVideo();
      } else {
        event.target.pauseVideo();
      }
      setTimeout(() => { isSyncing.current = false; }, 500);
      setInitialSync(null);
    } else {
      // Force play if we just added a new video locally
      event.target.playVideo();
    }
  };

  const onPlay = (event) => {
    // Event handled centrally in onStateChange
  };

  const onPause = (event) => {
    // Event handled centrally in onStateChange
  };

  const onError = (event) => {
    // Alert ALL errors so we know exactly why it is showing a blank screen
    let errorMsg = "Unknown Error";
    if (event.data === 2) errorMsg = "Invalid video ID.";
    if (event.data === 5) errorMsg = "HTML5 player error.";
    if (event.data === 100) errorMsg = "Video not found or deleted.";
    if (event.data === 101 || event.data === 150) errorMsg = "The copyright owner blocked this video from playing on external websites.";
    
    alert(`YouTube Player Error: ${errorMsg}\n\nSkipping to next song...`);
    socket.emit('play_next', { roomCode: code });
  };

  const onStateChange = (event) => {
    if (isSyncing.current) return;

    // 0: ENDED (Play next in queue)
    if (event.data === 0) {
       socket.emit('play_next', { roomCode: code });
    }
    // 3: BUFFERING (User A is buffering, so pause User B)
    else if (event.data === 3) {
      socket.emit('pause', { roomCode: code, currentTime: event.target.getCurrentTime() });
    }
    // 1: PLAYING (User A resumed, so play User B)
    else if (event.data === 1) {
      socket.emit('play', { roomCode: code, currentTime: event.target.getCurrentTime() });
    }
    // 2: PAUSED (User A paused, so pause User B)
    else if (event.data === 2) {
      socket.emit('pause', { roomCode: code, currentTime: event.target.getCurrentTime() });
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    let v = null;
    try {
      const urlObj = new URL(query);
      if (urlObj.hostname.includes('youtube.com')) {
        if (urlObj.pathname.includes('/shorts/')) {
          v = urlObj.pathname.split('/shorts/')[1].split('?')[0];
        } else {
          v = urlObj.searchParams.get('v');
        }
      } else if (urlObj.hostname.includes('youtu.be')) {
        v = urlObj.pathname.substring(1).split('?')[0];
      }
    } catch(err) {
      // Not a valid URL, v remains null
    }
    
    if (v && v.length === 11) {
      const mockVideo = {
        videoId: v,
        title: "Pasted Video Link",
        author: "Direct URL",
        thumbnail: `https://img.youtube.com/vi/${v}/hqdefault.jpg`
      };
      addToQueue(mockVideo);
      return; // Instant!
    }

    setIsSearching(true);
    socket.emit('search_song', query);
  };

  const addToQueue = (video) => {
    // If no video is currently playing, play it immediately
    if (!videoId) {
      setVideoId(video.videoId);
      socket.emit('change_video', { roomCode: code, videoId: video.videoId });
    } else {
      socket.emit('add_to_queue', { roomCode: code, video });
    }
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (chatInput.trim()) {
      socket.emit('send_message', { roomCode: code, text: chatInput });
      setChatInput('');
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDragStart = (e, index) => {
    setDraggedItemIdx(index);
    e.dataTransfer.effectAllowed = "move";
    setTimeout(() => {
      e.target.style.opacity = '0.4';
    }, 0);
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1';
    setDraggedItemIdx(null);
    setDraggedOverItemIdx(null);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault(); // Necessary to allow drop
    if (draggedOverItemIdx !== index) {
      setDraggedOverItemIdx(index);
    }
  };

  const handleDragLeave = (e, index) => {
    if (draggedOverItemIdx === index) {
      setDraggedOverItemIdx(null);
    }
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    setDraggedOverItemIdx(null);
    if (draggedItemIdx === null || draggedItemIdx === targetIndex) return;

    const newQueue = [...queue];
    const itemToMove = newQueue[draggedItemIdx];
    newQueue.splice(draggedItemIdx, 1);
    newQueue.splice(targetIndex, 0, itemToMove);

    setQueue(newQueue);
    socket.emit('update_queue', { roomCode: code, newQueue });
    setDraggedItemIdx(null);
  };



  useEffect(() => {
    socket.on('sync_video', (newVideoId) => {
       setVideoId(newVideoId);
    });
    return () => socket.off('sync_video');
  }, [socket]);



  return (
    <div className="room-container">
      <div className="header">
        <div className="room-code-display">
          <h2>Room: <span className="highlight">{code}</span></h2>
          <button className="copy-btn" onClick={handleCopyCode} title="Copy Room Code">
            {copied ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" color="#10b981"><polyline points="20 6 9 17 4 12"></polyline></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            )}
          </button>
        </div>
        
        <div className="header-actions">
          <form onSubmit={handleSearch} className="top-search-form">
            <input 
              type="text" 
              placeholder="Search or paste URL..." 
              className="url-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearch(e);
                }
              }}
            />
            <button type="submit" className="btn primary-btn" disabled={isSearching}>
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </form>
          <button className="btn secondary-btn" onClick={exitRoom}>Exit</button>
        </div>

        {searchResults.length > 0 && (
          <div className="top-search-results glass-panel">
            <div className="search-results-header">
              <h3>Search Results</h3>
              <button type="button" className="btn secondary-btn small-btn" onClick={() => setSearchResults([])}>Close</button>
            </div>
            <div className="search-results-list">
              {searchResults.map(video => (
                <div key={video.videoId} className="search-result-item" onClick={() => addToQueue(video)}>
                  <img src={video.thumbnail} alt={video.title} />
                  <div className="song-info">
                    <h4>{video.title}</h4>
                    <p>{video.author}</p>
                  </div>
                  <button className="btn secondary-btn small-btn">+</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      <div className="room-content-split">
        <div className="left-panel">
          <div className={`player-wrapper ${!videoId ? 'empty-wrapper' : ''}`}>
            {videoId ? (
              <YouTube 
                key={videoId}
                videoId={videoId} 
                opts={{ 
                  width: '100%', 
                  height: '100%', 
                  host: 'https://www.youtube-nocookie.com',
                  playerVars: { 
                    autoplay: 1, 
                    disablekb: 1,
                    controls: 1,
                    rel: 0,
                    enablejsapi: 1,
                    origin: window.location.origin
                  } 
                }} 
                onReady={onReady}
                onStateChange={onStateChange}
                onError={onError}
                className="youtube-player"
              />
            ) : (
              <div className="empty-player-state">
                <h2>Play your songs here</h2>
                <p>Pick a sample to get started:</p>
                <div className="sample-options">
                   <button type="button" className="btn secondary-btn" onClick={() => socket.emit('search_song', 'Top English Pop Songs 2024')}>English Pop</button>
                   <button type="button" className="btn secondary-btn" onClick={() => socket.emit('search_song', 'Top Hindi Bollywood Songs')}>Hindi Hits</button>
                   <button type="button" className="btn secondary-btn" onClick={() => socket.emit('search_song', 'Lofi Hip Hop Chill')}>Lofi Chill</button>
                </div>
              </div>
            )}
          </div>
          
          {queue.length > 0 && (
            <div className="next-song-preview glass-panel">
              <div className="preview-content">
                <div className="preview-text">
                  <h5>Coming Up Next</h5>
                  <h3>{queue[0].title}</h3>
                  <p>{queue[0].author}</p>
                  <button 
                    type="button" 
                    className="btn primary-btn" 
                    style={{ marginTop: '16px', padding: '10px 20px', width: 'max-content' }}
                    onClick={() => socket.emit('play_next', { roomCode: code })}
                  >
                    Play Next Song ⏭
                  </button>
                </div>
                <img src={queue[0].thumbnail} alt={queue[0].title} className="preview-thumbnail" />
              </div>
            </div>
          )}
        </div>

        <div className="right-panel">
          <div className="queue-section glass-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0 }}>Up Next ({queue.length})</h3>
              {queue.length > 0 && (
                <button 
                  type="button" 
                  className="btn secondary-btn small-btn"
                  onClick={() => socket.emit('play_next', { roomCode: code })}
                >
                  Skip ⏭
                </button>
              )}
            </div>
            <div className="queue-list">
              {queue.length === 0 ? <p className="empty-queue">Queue is empty. Search to add songs!</p> : null}
              {queue.map((video, idx) => {
                let dragClass = '';
                if (draggedOverItemIdx === idx && draggedItemIdx !== idx) {
                  dragClass = draggedItemIdx > idx ? 'drag-over-up' : 'drag-over-down';
                }
                return (
                  <div 
                    key={`${video.videoId}-${idx}`} 
                    className={`queue-item ${dragClass}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragLeave={(e) => handleDragLeave(e, idx)}
                    onDrop={(e) => handleDrop(e, idx)}
                  >
                    <span className="drag-handle">☰</span>
                    <span className="song-title">{idx + 1}. {video.title}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="chat-section glass-panel">
            <h3>Room Chat</h3>
            <div className="chat-messages">
              {messages.map(msg => (
                <div key={msg.id} className={`chat-message ${msg.senderId === socket.id ? 'my-message' : 'other-message'}`}>
                  <span className="sender">{msg.senderId === socket.id ? 'You' : 'Friend'}</span>
                  <p>{msg.text}</p>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <form onSubmit={handleSendMessage} className="chat-input-form">
              <input 
                type="text" 
                placeholder="Type a message..." 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="url-input"
              />
              <button type="submit" className="btn primary-btn small-btn">Send</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RoomPage;
