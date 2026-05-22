const { addUser, rebindUser, removeUser, getUser, getUserByName, getUserBySessionId, getUsersInRoom } = require("./utils/users");

const DISCONNECT_GRACE_MS = 30000;
const pendingDisconnects = new Map();

function setupSocket(io) {
  io.on("connection", (socket) => {
    const clearPendingDisconnect = (id) => {
      const timeout = pendingDisconnects.get(id);
      if (timeout) {
        clearTimeout(timeout);
        pendingDisconnects.delete(id);
      }
    };

    socket.on("join_room", ({ name, room, sessionId }) => {
      const reconnectingUser = getUserBySessionId(room, sessionId) ?? getUserByName(room, name);
      if (reconnectingUser && pendingDisconnects.has(reconnectingUser.id)) {
        clearPendingDisconnect(reconnectingUser.id);

        const reboundUser = rebindUser(reconnectingUser.id, socket.id);
        socket.join(room);
        socket.emit("join_success", {
          room,
          user: reboundUser,
          users: getUsersInRoom(room),
        });
        io.to(room).emit("room_users", getUsersInRoom(room));
        return;
      }

      const result = addUser(socket.id, name, room, sessionId);

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
      socket.to(room).emit("user_joined", { name: result.name });
      io.to(room).emit("room_users", getUsersInRoom(room));
    });

    socket.on("leave_room", ({ room, sessionId }, ack) => {
      const user = getUser(socket.id) ?? getUserBySessionId(room, sessionId);
      if (!user) {
        ack?.({ ok: true });
        return;
      }

      clearPendingDisconnect(user.id);
      const removedUser = removeUser(user.id);
      if (removedUser) {
        socket.leave(removedUser.room);
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
      socket.to(room).emit("receive_media", { id, author, dataUrl, fileMeta, ts, replyTo });
      ack?.({ ok: true });
    });

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
      io.to(targetSocketId).emit("ice_candidate", {
        candidate,
        msgId,
      });
    });

    socket.on("typing", ({ name, room }) => {
      socket.to(room).emit("typing", { name });
    });

    socket.on("stop_typing", ({ name, room }) => {
      socket.to(room).emit("stop_typing", { name });
    });

    socket.on("disconnect", () => {
      const user = getUser(socket.id);
      if (!user) return;

      const timeout = setTimeout(() => {
        pendingDisconnects.delete(socket.id);

        const removedUser = removeUser(socket.id);
        if (!removedUser) return;

        const { name, room } = removedUser;
        io.to(room).emit("user_left", { name });
        io.to(room).emit("room_users", getUsersInRoom(room));
      }, DISCONNECT_GRACE_MS);

      pendingDisconnects.set(socket.id, timeout);
    });
  });
}

module.exports = { setupSocket };
