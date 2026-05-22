const { addUser, removeUser, getUsersInRoom } = require("./utils/users");

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
      socket.to(room).emit("user_joined", { name: result.name });
      io.to(room).emit("room_users", getUsersInRoom(room));
    });

    socket.on("send_message", ({ id, room, author, message, ts }) => {
      socket.to(room).emit("receive_message", { id, room, author, message, ts });
    });

    socket.on("send_media", ({ id, room, author, dataUrl, fileMeta, ts, replyTo }) => {
      socket.to(room).emit("receive_media", { id, author, dataUrl, fileMeta, ts, replyTo });
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
      const user = removeUser(socket.id);
      if (!user) return;

      const { name, room } = user;
      io.to(room).emit("user_left", { name });
      io.to(room).emit("room_users", getUsersInRoom(room));
    });
  });
}

module.exports = { setupSocket };
