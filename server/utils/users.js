// server/utils/users.js — in-memory user store
// Exports: addUser, removeUser, getUser, getUsersInRoom

const NICKNAME_MAX_LENGTH = 24;
const NICKNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

// Module-level in-memory store
const users = [];

/**
 * Add a user to the store after validating the nickname.
 * @param {string} id   - Socket ID (unique per connection)
 * @param {string} name - Nickname (1–24 chars, [a-zA-Z0-9_])
 * @param {string} room - Room name the user is joining
 * @returns {{ id, name, room }} on success, or { error: string } on validation failure
 */
function addUser(id, name, room) {
  console.log(`[users] addUser called — id: ${id}, name: "${name}", room: "${room}"`);

  if (!name || name.length > NICKNAME_MAX_LENGTH) {
    const msg = "Nickname must be 24 characters or fewer.";
    console.log(`[users] addUser validation failed (length): "${name}"`);
    return { error: msg };
  }

  if (!NICKNAME_PATTERN.test(name)) {
    const msg = "Nickname may only contain letters, numbers, and underscores.";
    console.log(`[users] addUser validation failed (chars): "${name}"`);
    return { error: msg };
  }

  const user = { id, name, room };
  users.push(user);
  console.log(`[users] addUser success — store size: ${users.length}`);
  return user;
}

/**
 * Remove a user from the store by socket ID.
 * @param {string} id - Socket ID to remove
 * @returns {{ id, name, room }} the removed User, or undefined if not found
 */
function removeUser(id) {
  console.log(`[users] removeUser called — id: ${id}`);
  const index = users.findIndex((u) => u.id === id);
  if (index === -1) {
    console.log(`[users] removeUser — id not found: ${id}`);
    return undefined;
  }
  const [removed] = users.splice(index, 1);
  console.log(`[users] removeUser success — removed: "${removed.name}", store size: ${users.length}`);
  return removed;
}

/**
 * Look up a user by socket ID.
 * @param {string} id - Socket ID to look up
 * @returns {{ id, name, room }} the matching User, or undefined if not found
 */
function getUser(id) {
  const user = users.find((u) => u.id === id);
  console.log(`[users] getUser — id: ${id}, found: ${user ? `"${user.name}"` : "none"}`);
  return user;
}

/**
 * Get all users currently in a given room.
 * @param {string} room - Room name to filter by
 * @returns {{ id, name, room }[]} array of User records in that room
 */
function getUsersInRoom(room) {
  const result = users.filter((u) => u.room === room);
  console.log(`[users] getUsersInRoom — room: "${room}", count: ${result.length}`);
  return result;
}

module.exports = { addUser, removeUser, getUser, getUsersInRoom };
