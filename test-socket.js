const { io } = require('socket.io-client');

const socket = io('https://connect-world-r2tv.onrender.com', {
  reconnectionDelayMax: 10000,
});

socket.on('connect', () => {
  console.log('Successfully connected to Render socket!');
  socket.emit('create_room');
});

socket.on('room_created', (code) => {
  console.log('Room created with code:', code);
  process.exit(0);
});

socket.on('connect_error', (err) => {
  console.log('Connection error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.log('Timeout waiting for socket.');
  process.exit(1);
}, 15000);
