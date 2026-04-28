// server/socket.js — Socket.IO event handlers
// Exports setupSocket(io) which registers all event handlers.

const { addUser, removeUser, getUsersInRoom } = require('./utils/users');

/**
 * Register all Socket.IO event handlers on the given io instance.
 * @param {import('socket.io').Server} io
 */
function setupSocket(io) {
  io.on('connection', (socket) => {
    console.log(`[socket] Client connected — id: ${socket.id}`);

    // -------------------------------------------------------------------------
    // Task 4.1 — join_room
    // -------------------------------------------------------------------------
    socket.on('join_room', ({ name, room }) => {
      console.log(`[socket] join_room — id: ${socket.id}, name: "${name}", room: "${room}"`);

      const result = addUser(socket.id, name, room);

      if (result.error) {
        socket.emit('error', result.error);
        return;
      }

      socket.join(room);

      // Broadcast to everyone in the room, including the sender
      io.to(room).emit('user_joined', { name: result.name });
      io.to(room).emit('room_users', getUsersInRoom(room));
    });

    // -------------------------------------------------------------------------
    // Task 4.2 — send_message
    // -------------------------------------------------------------------------
    socket.on('send_message', ({ room, author, message }) => {
      console.log(`[socket] send_message — room: "${room}", author: "${author}"`);

      // Relay to everyone in the room except the sender
      socket.to(room).emit('receive_message', { room, author, message });
    });

    // -------------------------------------------------------------------------
    // send_image — small file/image relay (≤5 MB, base64 data URL)
    // -------------------------------------------------------------------------
    socket.on('send_image', ({ room, author, dataUrl, fileMeta }) => {
      console.log(`[socket] send_image — room: "${room}", author: "${author}", file: "${fileMeta?.name}"`);
      // Relay to everyone in the room except the sender
      socket.to(room).emit('receive_image', { author, dataUrl, fileMeta });
    });

    // -------------------------------------------------------------------------
    // Task 4.3 — WebRTC signaling handlers
    // -------------------------------------------------------------------------
    socket.on('webrtc_offer', ({ room, offer, fileMeta }) => {
      console.log(`[socket] webrtc_offer — room: "${room}"`);
      socket.to(room).emit('webrtc_offer', { offer, fileMeta });
    });

    socket.on('webrtc_answer', ({ room, answer }) => {
      console.log(`[socket] webrtc_answer — room: "${room}"`);
      socket.to(room).emit('webrtc_answer', { answer });
    });

    socket.on('ice_candidate', ({ room, candidate }) => {
      console.log(`[socket] ice_candidate — room: "${room}"`);
      socket.to(room).emit('ice_candidate', { candidate });
    });

    // -------------------------------------------------------------------------
    // Task 4.4 — disconnect
    // -------------------------------------------------------------------------
    socket.on('disconnect', () => {
      console.log(`[socket] disconnect — id: ${socket.id}`);

      const user = removeUser(socket.id);

      if (!user) return; // Socket disconnected before completing join_room

      const { name, room } = user;

      io.to(room).emit('user_left', { name });
      io.to(room).emit('room_users', getUsersInRoom(room));

      console.log(`[socket] user_left broadcast — name: "${name}", room: "${room}"`);
    });
  });
}

module.exports = { setupSocket };
