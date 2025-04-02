const express = require('express');
const path = require('path');
const http = require('http'); // Import http module
const { Server } = require("socket.io"); // Import Server from socket.io

const app = express();
const server = http.createServer(app); // Create http server from express app
const io = new Server(server); // Attach socket.io to the http server

const port = process.env.PORT || 3000;

// Function to generate a unique room ID (simple example)
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const rooms = {}; // Store room information { roomId: [socketId1, socketId2] }
const socketToRoom = {}; // Map socketId to roomId for quick lookup on disconnect { socketId: roomId }

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('a user connected:', socket.id);

  // --- Room Management ---

  socket.on('create-room', () => {
    let roomId;
    do {
      roomId = generateRoomId();
    } while (rooms[roomId]); // Ensure ID is unique

    socket.join(roomId);
    rooms[roomId] = [socket.id];
    socketToRoom[socket.id] = roomId;

    console.log(`User ${socket.id} created and joined room ${roomId}`);
    socket.emit('room-created', roomId);
  });

  socket.on('join-room', (roomId) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    let numClients = 0;
    if (room) {
        numClients = room.size;
    }

    if (numClients === 0) {
         console.log(`User ${socket.id} tried to join non-existent room ${roomId}`);
         socket.emit('room-not-found', roomId);
    } else if (numClients === 1) {
         console.log(`User ${socket.id} joining room ${roomId}`);
         socket.join(roomId);
         // Ensure rooms[roomId] exists before pushing
         if (!rooms[roomId]) rooms[roomId] = []; 
         rooms[roomId].push(socket.id);
         socketToRoom[socket.id] = roomId;

         socket.emit('room-joined', roomId); // Notify the joiner
         socket.to(roomId).emit('peer-joined', socket.id); // Notify the other peer
         console.log(`Room ${roomId} now has ${io.sockets.adapter.rooms.get(roomId)?.size || 0} members.`);
    } else { // Room might be full or user is already in
        const isInRoom = rooms[roomId]?.includes(socket.id);
        if (isInRoom) {
            console.log(`User ${socket.id} tried to join room ${roomId} again.`);
            // Optionally emit an 'already-in-room' event
            socket.emit('room-joined', roomId); // Or just treat as success
        } else {
             console.log(`User ${socket.id} tried to join full room ${roomId}`);
             socket.emit('room-full', roomId);
        }
    }
  });

  socket.on('ready', (roomId) => {
    if (!roomId) return console.error('Ready signal received without room ID');
    console.log(`User ${socket.id} is ready in room ${roomId}`);
    socket.to(roomId).emit('ready', socket.id); // Signal readiness to the other peer in the room
  });


  // --- WebRTC Signaling (Room-Specific) ---

  socket.on('offer', (payload) => {
    const { offer, room } = payload;
    if (!room) return console.error('Offer received without room ID from', socket.id);
    console.log(`Relaying offer from ${socket.id} to room ${room}`);
    socket.to(room).emit('offer', { offer: offer, senderId: socket.id }); // Send only to others in the room
  });

  socket.on('answer', (payload) => {
    const { answer, room } = payload;
     if (!room) return console.error('Answer received without room ID from', socket.id);
    console.log(`Relaying answer from ${socket.id} to room ${room}`);
    socket.to(room).emit('answer', { answer: answer, senderId: socket.id }); // Send only to others in the room
  });

  socket.on('ice-candidate', (payload) => {
    const { candidate, room } = payload;
     if (!room) return console.error('ICE candidate received without room ID from', socket.id);
    // console.log(`Relaying ICE candidate from ${socket.id} to room ${room}`); // Still noisy
    socket.to(room).emit('ice-candidate', { candidate: candidate, senderId: socket.id }); // Send only to others in the room
  });

  // Handle hangup signal
  socket.on('hangup', (payload) => {
    const { room } = payload;
     if (!room) return console.error('Hangup received without room ID from', socket.id);
    console.log(`Relaying hangup from ${socket.id} to room ${room}`);
    socket.to(room).emit('hangup', socket.id); // Notify others in the room
    // Optional: Server-side cleanup could happen here too, like forcing leave
    // Clean up room state immediately on hangup as well
    const roomId = socketToRoom[socket.id]; // Get room from lookup
    if (roomId && room === roomId && rooms[roomId]) {
         console.log(`Hangup initiated cleanup for user ${socket.id} in room ${roomId}`);
         // Notify peer and potentially remove room if it becomes empty
         // Note: Disconnect handler will also run, ensure logic is idempotent or coordinated
         rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
          if (rooms[roomId].length === 0) {
             console.log(`Room ${roomId} became empty after hangup, deleting.`);
             delete rooms[roomId];
         } else {
            // No need to re-notify on hangup, peer already received 'hangup' event
         }
         delete socketToRoom[socket.id];
    }

  });

  // Relay status updates (mute/video)
  socket.on('status-update', (payload) => {
      const { room, type, isEnabled } = payload;
      if (!room) return console.error('Status update received without room ID from', socket.id);
      // console.log(`Relaying status update (${type}: ${isEnabled}) from ${socket.id} to room ${room}`); // Can be noisy
      socket.to(room).emit('peer-status-update', { type, isEnabled, senderId: socket.id });
  });

  // Relay reactions
  socket.on('reaction', (payload) => {
      const { room, emoji } = payload;
      if (!room) return console.error('Reaction received without room ID from', socket.id);
      // console.log(`Relaying reaction (${emoji}) from ${socket.id} to room ${room}`);
      socket.to(room).emit('reaction', { emoji, senderId: socket.id });
  });

  // --- Disconnection --- Implement robust cleanup

  socket.on('disconnect', (reason) => {
    console.log(`user disconnected: ${socket.id}, reason: ${reason}`);
    const roomId = socketToRoom[socket.id];

    if (roomId && rooms[roomId]) {
        console.log(`Cleaning up room ${roomId} after disconnect of ${socket.id}`);

        // Notify the other peer in the room (if any)
        const remainingPeers = rooms[roomId].filter(id => id !== socket.id);
        if (remainingPeers.length > 0) {
            console.log(`Notifying remaining peers in room ${roomId} about disconnect of ${socket.id}`);
            remainingPeers.forEach(peerId => {
                 io.to(peerId).emit('peer-disconnected', { socketId: socket.id, room: roomId });
            });
            rooms[roomId] = remainingPeers; // Update room participants
        } else {
            console.log(`Room ${roomId} is now empty after disconnect, deleting.`);
            delete rooms[roomId]; // Clean up empty room
        }
    } else {
        console.log(`User ${socket.id} was not in a tracked room or room was already cleaned up.`);
    }
     // Always remove from lookup on disconnect
     delete socketToRoom[socket.id];

  });
});

// Start the server using the http server instance
server.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
}); 