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
    // join_room
    // -------------------------------------------------------------------------
    socket.on('join_room', ({ name, room }) => {
      console.log(`[socket] join_room — id: ${socket.id}, name: "${name}", room: "${room}"`);

      const result = addUser(socket.id, name, room);

      if (result.error) {
        socket.emit('error', result.error);
        return;
      }

      socket.join(room);
      // Broadcast the join event to peers only so the sender does not see
      // repeated self-join system messages after reconnects.
      socket.to(room).emit('user_joined', { name: result.name });
      io.to(room).emit('room_users', getUsersInRoom(room));
    });

    // -------------------------------------------------------------------------
    // send_message
    // -------------------------------------------------------------------------
    socket.on('send_message', ({ room, author, message }) => {
      console.log(`[socket] send_message — room: "${room}", author: "${author}"`);
      socket.to(room).emit('receive_message', { room, author, message });
    });

    // -------------------------------------------------------------------------
    // send_image — small file relay (≤5 MB, base64 data URL)
    // -------------------------------------------------------------------------
    socket.on('send_image', ({ room, author, dataUrl, fileMeta }) => {
      console.log(`[socket] send_image — room: "${room}", author: "${author}", file: "${fileMeta?.name}"`);
      socket.to(room).emit('receive_image', { author, dataUrl, fileMeta });
    });

    // -------------------------------------------------------------------------
    // WebRTC signaling — point-to-point routing
    //
    // Every signal carries:
    //   msgId          — unique transfer ID (ties offer/answer/ICE together)
    //   senderSocketId — so the receiver knows who to reply to
    //   targetSocketId — so the server routes the reply to the right peer
    // -------------------------------------------------------------------------

    // Sender → room (broadcast so all peers see the offer)
    socket.on('webrtc_offer', ({ room, offer, fileMeta, msgId }) => {
      console.log(`[socket] webrtc_offer — room: "${room}", msgId: "${msgId}", from: ${socket.id}`);
      // Broadcast to room; include senderSocketId so receiver can reply directly
      socket.to(room).emit('webrtc_offer', {
        offer,
        fileMeta,
        msgId,
        senderSocketId: socket.id,
      });
    });

    // Receiver → sender (direct, not broadcast)
    socket.on('webrtc_answer', ({ answer, msgId, targetSocketId }) => {
      console.log(`[socket] webrtc_answer — msgId: "${msgId}", target: ${targetSocketId}`);
      // Route directly to the sender socket, include receiver's socketId
      io.to(targetSocketId).emit('webrtc_answer', {
        answer,
        msgId,
        receiverSocketId: socket.id,
      });
    });

    // ICE candidates — routed directly to the target peer
    socket.on('ice_candidate', ({ candidate, msgId, targetSocketId }) => {
      console.log(`[socket] ice_candidate — msgId: "${msgId}", target: ${targetSocketId}`);
      io.to(targetSocketId).emit('ice_candidate', {
        candidate,
        msgId,
      });
    });

    // -------------------------------------------------------------------------
    // disconnect
    // -------------------------------------------------------------------------
    socket.on('disconnect', () => {
      console.log(`[socket] disconnect — id: ${socket.id}`);

      const user = removeUser(socket.id);
      if (!user) return;

      const { name, room } = user;
      io.to(room).emit('user_left', { name });
      io.to(room).emit('room_users', getUsersInRoom(room));

      console.log(`[socket] user_left broadcast — name: "${name}", room: "${room}"`);
    });
  });
}

module.exports = { setupSocket };
