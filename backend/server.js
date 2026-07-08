const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const ytSearch = require('yt-search');
const path = require('path');

const app = express();
app.use(cors());

// Serve the built frontend
app.use(express.static(path.join(__dirname, '../client/dist')));

// Send all other routes to React Router
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*', // To be restricted later in production
    methods: ['GET', 'POST']
  }
});

// In-memory room state storage
const rooms = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Create a new room
  socket.on('create_room', () => {
    let roomCode;
    // Generate a unique 6-digit code
    do {
      roomCode = Math.floor(100000 + Math.random() * 900000).toString();
    } while (rooms[roomCode]);

    rooms[roomCode] = {
      users: [socket.id],
      videoId: "", // Empty string instead of default video
      queue: [],
      messages: [],
      isPlaying: false,
      currentTime: 0,
      lastUpdateTime: Date.now()
    };
    
    socket.join(roomCode);
    socket.emit('room_created', { roomCode });
    console.log(`Room created: ${roomCode} by ${socket.id}`);
  });

  // Join an existing room
  socket.on('join_room', (data) => {
    const roomCode = typeof data === 'object' ? data.roomCode : data;

    const room = rooms[roomCode];
    if (room) {
      if (room.deletionTimeout) {
        clearTimeout(room.deletionTimeout);
        delete room.deletionTimeout;
      }
      if (!room.users.includes(socket.id)) {
        room.users.push(socket.id);
      }
      socket.join(roomCode);
      
      socket.emit('room_joined', room);
      console.log(`User ${socket.id} joined room ${roomCode}`);
    } else {
      socket.emit('error', { type: 'NOT_FOUND', message: 'Room not found. Invalid code.' });
    }
  });

  // Video playback controls
  socket.on('play', (data) => {
    const room = rooms[data.roomCode];
    if (room) {
      room.isPlaying = true;
      room.currentTime = data.currentTime;
      room.lastUpdateTime = Date.now();
      // Broadcast to everyone else in the room
      socket.to(data.roomCode).emit('play', data);
    }
  });

  socket.on('pause', (data) => {
    const room = rooms[data.roomCode];
    if (room) {
      room.isPlaying = false;
      room.currentTime = data.currentTime;
      room.lastUpdateTime = Date.now();
      socket.to(data.roomCode).emit('pause', data);
    }
  });

  socket.on('seek', (data) => {
    const room = rooms[data.roomCode];
    if (room) {
      room.currentTime = data.currentTime;
      room.lastUpdateTime = Date.now();
      socket.to(data.roomCode).emit('seek', data);
    }
  });

  socket.on('change_video', ({ roomCode, videoId }) => {
    const room = rooms[roomCode];
    if (room) {
      room.videoId = videoId;
      room.isPlaying = false;
      room.currentTime = 0;
      room.lastUpdateTime = Date.now();
      io.to(roomCode).emit('sync_video', videoId);
      console.log(`Room ${roomCode} changed video to ${videoId}`);
    }
  });

  socket.on('add_to_queue', ({ roomCode, video }) => {
    const room = rooms[roomCode];
    if (room) {
      room.queue.push(video);
      io.to(roomCode).emit('queue_updated', room.queue);
    }
  });

  socket.on('update_queue', ({ roomCode, newQueue }) => {
    const room = rooms[roomCode];
    if (room) {
      room.queue = newQueue;
      socket.to(roomCode).emit('queue_updated', room.queue);
    }
  });

  socket.on('play_next', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && room.queue.length > 0) {
      const nextVideo = room.queue.shift();
      room.videoId = nextVideo.videoId;
      room.isPlaying = true;
      room.currentTime = 0;
      room.lastUpdateTime = Date.now();
      io.to(roomCode).emit('sync_video', room.videoId);
      io.to(roomCode).emit('queue_updated', room.queue);
    }
  });

  socket.on('get_room_state', (data) => {
    const roomCode = typeof data === 'object' ? data.roomCode : data;

    const room = rooms[roomCode];
    if (room) {
      if (room.deletionTimeout) {
        clearTimeout(room.deletionTimeout);
        delete room.deletionTimeout;
      }
      // Re-join just in case they refreshed
      socket.join(roomCode);
      if (!room.users.includes(socket.id)) {
        room.users.push(socket.id);
      }

      socket.emit('room_state_sync', room);
    } else {
      socket.emit('error', { type: 'NOT_FOUND', message: 'Room not found. Invalid code.' });
    }
  });

  socket.on('search_song', async (query) => {
    try {
      const results = await ytSearch(query);
      const videos = results.videos.slice(0, 10).map(v => ({
        videoId: v.videoId,
        title: v.title,
        author: v.author.name,
        thumbnail: v.thumbnail,
        timestamp: v.timestamp
      }));
      socket.emit('search_results', videos);
    } catch(err) {
      console.error('Search error:', err);
    }
  });

  // Chat Support
  socket.on('send_message', ({ roomCode, text }) => {
    const room = rooms[roomCode];
    if (room) {
      const messageObj = {
        id: Date.now() + Math.random().toString(),
        senderId: socket.id,
        text,
        timestamp: Date.now()
      };
      room.messages.push(messageObj);
      // Limit to last 100 messages to prevent memory leak
      if (room.messages.length > 100) {
        room.messages.shift();
      }
      // Broadcast to everyone including sender
      io.to(roomCode).emit('new_message', messageObj);
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    // Remove user from their room, cleanup if empty
    for (const [code, room] of Object.entries(rooms)) {
      const userIndex = room.users.indexOf(socket.id);
      if (userIndex !== -1) {
        room.users.splice(userIndex, 1);
        
        // Auto-pause the room when someone leaves/refreshes
        if (room.isPlaying) {
          room.isPlaying = false;
          // Estimate current time based on last update
          const timeElapsed = (Date.now() - room.lastUpdateTime) / 1000;
          room.currentTime += timeElapsed;
          room.lastUpdateTime = Date.now();
          io.to(code).emit('pause', { roomCode: code, currentTime: room.currentTime });
        }

        if (room.users.length === 0) {
          // Give them 1 minute to reconnect before destroying the room
          room.deletionTimeout = setTimeout(() => {
            if (rooms[code] && rooms[code].users.length === 0) {
              delete rooms[code];
              console.log(`Room ${code} deleted (empty) after timeout`);
            }
          }, 60000); // 60 seconds
          console.log(`Room ${code} scheduled for deletion in 60s`);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
