/**
 * server/socket.js
 * Minimal, stable Socket.IO flow for chat + media + WebRTC signaling.
 */

const { addUser, removeUser, getUser, getUsersInRoom } = require("./utils/users");
const MAX_FILE_SIZE = 500 * 1024 * 1024;

function validFileMeta(fileMeta) {
  return Boolean(fileMeta && typeof fileMeta.name === "string" && fileMeta.name.length > 0 && fileMeta.name.length <= 255 && Number.isSafeInteger(fileMeta.size) && fileMeta.size >= 0 && fileMeta.size <= MAX_FILE_SIZE && (fileMeta.mimeType === undefined || typeof fileMeta.mimeType === "string"));
}

function setupSocket(io) {
  const offers = new Map();
  io.on("connection", (socket) => {
    socket.on("join_room", ({ name, room }) => {
      const existing = getUser(socket.id);
      // Socket.IO may replay a join after a transient reconnect. Treat an
      // identical join as idempotent so it cannot create phantom leave/join
      // notifications or replace the member with a new anonymous name.
      if (existing && existing.room === room && existing.name === name) {
        socket.join(room);
        socket.emit("join_success", { room, user: existing, users: getUsersInRoom(room) });
        io.to(room).emit("room_users", getUsersInRoom(room));
        return;
      }

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

    socket.on("file_offer", ({ room, msgId, fileMeta, transferGroup }) => {
      const user = getUser(socket.id);
      if (!user || user.room !== room || !msgId || !validFileMeta(fileMeta)) return;
      offers.set(msgId, { room, senderSocketId: socket.id, fileMeta });
      socket.to(room).emit("file_offer", {
        msgId,
        fileMeta,
        transferGroup,
        senderSocketId: socket.id,
        senderName: user.name,
      });
    });


    socket.on("webrtc_request", ({ room, msgId, targetSocketId }) => {
      const requester = getUser(socket.id);
      const target = getUser(targetSocketId);
      const offer = offers.get(msgId);
      if (!requester || !target || !offer || offer.room !== room || offer.senderSocketId !== targetSocketId || requester.room !== room || target.room !== room) return;
      io.to(targetSocketId).emit("webrtc_request", { room, msgId, receiverSocketId: socket.id });
    });

    socket.on("webrtc_offer", ({ room, targetSocketId, offer, fileMeta, msgId, transferGroup }) => {
      const sender = getUser(socket.id);
      const receiver = getUser(targetSocketId);
      const offerRecord = offers.get(msgId);
      if (!sender || !receiver || !offerRecord || offerRecord.senderSocketId !== socket.id || offerRecord.room !== room || receiver.room !== room || sender.room !== room || !validFileMeta(fileMeta) || offerRecord.fileMeta.name !== fileMeta.name || offerRecord.fileMeta.size !== fileMeta.size || offerRecord.fileMeta.mimeType !== fileMeta.mimeType) return;
      io.to(targetSocketId).emit("webrtc_offer", {
        offer,
        fileMeta,
        transferGroup,
        msgId,
        senderSocketId: socket.id,
        senderName: sender.name,
      });
    });

    socket.on("webrtc_answer", ({ answer, msgId, targetSocketId }) => {
      if (!getUser(socket.id) || !getUser(targetSocketId) || getUser(socket.id).room !== getUser(targetSocketId).room) return;
      io.to(targetSocketId).emit("webrtc_answer", {
        answer,
        msgId,
        receiverSocketId: socket.id,
      });
    });

    socket.on("ice_candidate", ({ candidate, msgId, targetSocketId }) => {
      if (!getUser(socket.id) || !getUser(targetSocketId) || getUser(socket.id).room !== getUser(targetSocketId).room) return;
      io.to(targetSocketId).emit("ice_candidate", { candidate, msgId, fromSocketId: socket.id });
    });

    // Keep typing indicators untouched.
    socket.on("typing", ({ name, room }) => {
      socket.to(room).emit("typing", { name });
    });

    socket.on("stop_typing", ({ name, room }) => {
      socket.to(room).emit("stop_typing", { name });
    });

    socket.on("disconnect", () => {
      for (const [msgId, offer] of offers) if (offer.senderSocketId === socket.id) offers.delete(msgId);
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
