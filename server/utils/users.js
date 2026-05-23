// server/utils/users.js
// In-memory user store with O(1) duplicate checks per room.

const NICKNAME_MAX_LENGTH = 24;
const NICKNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

// Primary index: socket.id → user
const usersById = new Map();

// Room index: room → (name → user)
const roomMembers = new Map();

function getRoomMap(room) {
  let members = roomMembers.get(room);
  if (!members) {
    members = new Map();
    roomMembers.set(room, members);
  }
  return members;
}

function addUser(id, name, room) {
  if (!name || name.length > NICKNAME_MAX_LENGTH) {
    return { error: "Nickname must be 24 characters or fewer." };
  }
  if (!NICKNAME_PATTERN.test(name)) {
    return { error: "Nickname may only contain letters, numbers, and underscores." };
  }

  const members = getRoomMap(room);
  if (members.has(name)) {
    return { error: "Nickname already taken in this room." };
  }

  // Clean up any stale entry for this socket.id
  const existingUser = usersById.get(id);
  if (existingUser) {
    removeUser(id);
  }

  const user = { id, name, room };
  usersById.set(id, user);
  members.set(name, user);
  return user;
}

function removeUser(id) {
  const user = usersById.get(id);
  if (!user) return undefined;

  usersById.delete(id);
  const members = roomMembers.get(user.room);
  if (members) {
    members.delete(user.name);
    if (members.size === 0) {
      roomMembers.delete(user.room);
    }
  }

  return user;
}

function getUser(id) {
  return usersById.get(id);
}

function getUsersInRoom(room) {
  const members = roomMembers.get(room);
  return members ? Array.from(members.values()) : [];
}

module.exports = {
  addUser,
  removeUser,
  getUser,
  getUsersInRoom,
};
