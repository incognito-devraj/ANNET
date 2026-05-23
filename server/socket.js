/**
 * server/socket.js
 * Minimal, stable Socket.IO flow for chat + media + WebRTC signaling.
 */

const { addUser, removeUser, getUser, getUsersInRoom } = require("./utils/users");

function setupSocket(io) {
  io.on("connection", (socket) => {
    socket.on("join_room", ({ name, room }) => {
      const result = addUser(socket.id, name, room);
      if (result.error) {
        socket.emit("error", result.error);
        return;
      }

      socket.join(room);

      socket.emit("join_success", {
        room,
        user: result,
        users: getUsersInRoom(room),
      });

      // Broadcast only to peers to avoid duplicate self-join system messages.
      socket.to(room).emit("user_joined", { name: result.name });
      io.to(room).emit("room_users", getUsersInRoom(room));
    });

    socket.on("leave_room", ({ room }, ack) => {
      const user = getUser(socket.id);
      if (!user) {
        ack?.({ ok: true });
        return;
      }

      const removedUser = removeUser(socket.id);
      if (removedUser) {
        socket.leave(room || removedUser.room);
        io.to(removedUser.room).emit("user_left", { name: removedUser.name });
        io.to(removedUser.room).emit("room_users", getUsersInRoom(removedUser.room));
      }

      ack?.({ ok: true });
    });

    socket.on("send_message", ({ id, room, author, message, ts }, ack) => {
      socket.to(room).emit("receive_message", { id, room, author, message, ts });
      ack?.({ ok: true });
    });

    socket.on("send_media", ({ id, room, author, dataUrl, fileMeta, ts, replyTo }, ack) => {
      socket.to(room).emit("receive_media", {
        id,
        room,
        author,
        dataUrl,
        fileMeta,
        ts,
        replyTo,
      });
      ack?.({ ok: true });
    });

    // Keep WebRTC signaling untouched.
    socket.on("webrtc_offer", ({ room, offer, fileMeta, msgId }) => {
      socket.to(room).emit("webrtc_offer", {
        offer,
        fileMeta,
        msgId,
        senderSocketId: socket.id,
      });
    });

    socket.on("webrtc_answer", ({ answer, msgId, targetSocketId }) => {
      io.to(targetSocketId).emit("webrtc_answer", {
        answer,
        msgId,
        receiverSocketId: socket.id,
      });
    });

    socket.on("ice_candidate", ({ candidate, msgId, targetSocketId }) => {
      io.to(targetSocketId).emit("ice_candidate", { candidate, msgId });
    });

    // Keep typing indicators untouched.
    socket.on("typing", ({ name, room }) => {
      socket.to(room).emit("typing", { name });
    });

    socket.on("stop_typing", ({ name, room }) => {
      socket.to(room).emit("stop_typing", { name });
    });

    socket.on("disconnect", () => {
      const user = removeUser(socket.id);
      if (!user) return;

      io.to(user.room).emit("user_left", {
        name: user.name,
      });

      io.to(user.room).emit("room_users", getUsersInRoom(user.room));
    });
  });
}

module.exports = { setupSocket };
