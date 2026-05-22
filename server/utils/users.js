// server/utils/users.js
// In-memory user store with O(1) duplicate checks per room.

const NICKNAME_MAX_LENGTH = 24;
const NICKNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

const usersById = new Map();
const roomMembers = new Map();

function getRoomMap(room) {
  let members = roomMembers.get(room);
  if (!members) {
    members = new Map();
    roomMembers.set(room, members);
  }
  return members;
}

function addUser(id, name, room, sessionId) {
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

  const existingUser = usersById.get(id);
  if (existingUser) {
    removeUser(id);
  }

  const user = { id, name, room, sessionId };
  usersById.set(id, user);
  members.set(name, user);
  return user;
}

function rebindUser(oldId, newId) {
  const user = usersById.get(oldId);
  if (!user) return undefined;

  usersById.delete(oldId);
  const reboundUser = { ...user, id: newId };
  usersById.set(newId, reboundUser);

  const members = roomMembers.get(user.room);
  if (members) {
    members.set(user.name, reboundUser);
  }

  return reboundUser;
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

function getUserByName(room, name) {
  const members = roomMembers.get(room);
  return members?.get(name);
}

function getUserBySessionId(room, sessionId) {
  if (!sessionId) return undefined;

  const members = roomMembers.get(room);
  if (!members) return undefined;

  for (const user of members.values()) {
    if (user.sessionId === sessionId) return user;
  }

  return undefined;
}

function getUsersInRoom(room) {
  const members = roomMembers.get(room);
  return members ? Array.from(members.values()) : [];
}

module.exports = { addUser, rebindUser, removeUser, getUser, getUserByName, getUserBySessionId, getUsersInRoom };
