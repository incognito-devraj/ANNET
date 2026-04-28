# Implementation Plan: Anonet Backend

## Overview

Implement a lightweight real-time chat backend in Node.js using Express.js and Socket.IO. All state is held in-memory. The implementation is split across three files: `server/index.js` (startup), `server/socket.js` (event handlers), and `server/utils/users.js` (in-memory user store). Tests use Jest and fast-check.

## Tasks

- [x] 1. Project setup
  - Create `server/` directory structure: `index.js`, `socket.js`, `utils/users.js`
  - Create `server/package.json` with `name`, `main: "index.js"`, `scripts: { start, test }`, and exact-version dependencies: `express`, `socket.io`, `cors`; devDependencies: `jest`, `fast-check`
  - Add a `.gitignore` entry for `node_modules`
  - _Requirements: 10.1, 10.2, 10.3_

- [x] 2. Implement `server/utils/users.js` — in-memory user store
  - [x] 2.1 Implement the module-level `users` array and the four exported functions: `addUser`, `removeUser`, `getUser`, `getUsersInRoom`
    - `addUser(id, name, room)`: run nickname validation, push `{ id, name, room }` to the array, return the new User record or `{ error }` on failure
    - `removeUser(id)`: splice the matching record out and return it, or return `undefined`
    - `getUser(id)`: return the matching record or `undefined`
    - `getUsersInRoom(room)`: return all records whose `room` field matches
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 10.3_

  - [ ]* 2.2 Write unit tests for `utils/users.js`
    - `getUser` returns `undefined` for an unknown ID
    - `addUser` returns an error for an empty nickname
    - `addUser` returns an error for a nickname of exactly 25 characters (boundary)
    - `addUser` accepts a nickname of exactly 24 characters (boundary)
    - `removeUser` returns `undefined` for an unknown ID
    - _Requirements: 2.2, 2.3, 2.4, 3.1, 3.2_

  - [ ]* 2.3 Write property test for `addUser` round-trip — record structure and retrievability
    - **Property 1: addUser round-trip — record structure and retrievability**
    - **Validates: Requirements 2.1, 2.2**
    - Use `fc.stringMatching(/^[a-zA-Z0-9_]{1,24}$/)` for valid nicknames
    - Assert returned User contains `{ id, name, room }` and `getUser(id)` returns the same record

  - [ ]* 2.4 Write property test for `removeUser` round-trip
    - **Property 2: removeUser round-trip**
    - **Validates: Requirements 2.3**
    - Add a user, call `removeUser(id)`, assert the returned record matches, then assert `getUser(id)` returns `undefined`

  - [ ]* 2.5 Write property test for `getUsersInRoom` filter correctness
    - **Property 3: getUsersInRoom filter correctness**
    - **Validates: Requirements 2.5**
    - Generate multiple users across multiple rooms; assert `getUsersInRoom(room)` returns exactly the users in that room — no extras, no omissions

  - [ ]* 2.6 Write property test for nickname length validation
    - **Property 4: Nickname length validation**
    - **Validates: Requirements 3.1**
    - Use `fc.string({ minLength: 25 })` for too-long nicknames; assert `addUser` returns `{ error }` and the store is unchanged

  - [ ]* 2.7 Write property test for nickname character validation
    - **Property 5: Nickname character validation**
    - **Validates: Requirements 3.2**
    - Generate strings containing at least one character outside `[a-zA-Z0-9_]`; assert `addUser` returns `{ error }` and the store is unchanged

- [x] 3. Checkpoint — Ensure all `utils/users.js` tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement `server/socket.js` — Socket.IO event handlers
  - [x] 4.1 Implement `setupSocket(io)` and the `join_room` handler
    - Export `setupSocket(io)` as the default export
    - On `join_room { name, room }`: call `addUser`; if error, emit `error` to sender and return; otherwise call `socket.join(room)`, broadcast `user_joined { name }` and `room_users` to the room; log the event
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 3.3, 3.4, 10.2_

  - [x] 4.2 Implement the `send_message` handler
    - On `send_message { room, author, message }`: use `socket.to(room).emit('receive_message', { room, author, message })`; log the event
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 4.3 Implement the WebRTC signaling handlers: `webrtc_offer`, `webrtc_answer`, `ice_candidate`
    - `webrtc_offer { room, offer, fileMeta }`: relay `{ offer, fileMeta }` to `socket.to(room)`
    - `webrtc_answer { room, answer }`: relay `{ answer }` to `socket.to(room)`
    - `ice_candidate { room, candidate }`: relay `{ candidate }` to `socket.to(room)`
    - None of these handlers store, inspect, or modify the payloads
    - _Requirements: 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3_

  - [x] 4.4 Implement the `disconnect` handler
    - On `disconnect`: call `removeUser(socket.id)`; if no user found, return; otherwise broadcast `user_left { name }` and `room_users` to the room; log the disconnection
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 4.5 Write unit tests for `socket.js` event handlers
    - Mock `socket` (with `emit`, `join`, `to`) and `io`; import `users.js` directly (no mock)
    - `join_room` with invalid nickname → `socket.emit('error', ...)` called, `socket.join` not called
    - `join_room` with valid nickname → `socket.join(room)` called, `user_joined` and `room_users` broadcast
    - `send_message` → `socket.to(room).emit('receive_message', payload)` called
    - `disconnect` with no matching user → no broadcast emitted
    - `disconnect` with matching user → `user_left` and `room_users` broadcast
    - _Requirements: 3.3, 3.4, 4.2, 4.3, 4.4, 5.1, 5.2, 6.1, 6.2, 6.3_

  - [ ]* 4.6 Write property test for `room_users` snapshot after join is complete
    - **Property 6: room_users snapshot after join is complete**
    - **Validates: Requirements 4.4**
    - For any set of valid users joining a room, assert the `room_users` payload after the last join contains every user in the room including the one who just joined

  - [ ]* 4.7 Write property test for `send_message` relay — payload fidelity and no echo
    - **Property 7: send_message relay — payload fidelity and no echo**
    - **Validates: Requirements 5.1, 5.2**
    - Assert `socket.to(room).emit` is called with the identical `{ room, author, message }` payload and `socket.emit` is never called with `receive_message`

  - [ ]* 4.8 Write property test for `room_users` snapshot after disconnect excludes removed user
    - **Property 8: room_users snapshot after disconnect excludes removed user**
    - **Validates: Requirements 6.3**
    - After a user disconnects, assert the `room_users` broadcast does not contain the disconnected user

  - [ ]* 4.9 Write property test for `webrtc_offer` relay — payload fidelity and no echo
    - **Property 9: webrtc_offer relay — payload fidelity and no echo**
    - **Validates: Requirements 7.1, 7.2, 7.3**
    - Assert `socket.to(room).emit('webrtc_offer', { offer, fileMeta })` is called with the identical payload and `socket.emit` is never called with `webrtc_offer`

  - [ ]* 4.10 Write property test for `webrtc_answer` relay — payload fidelity and no echo
    - **Property 10: webrtc_answer relay — payload fidelity and no echo**
    - **Validates: Requirements 8.1, 8.2, 8.3**
    - Assert `socket.to(room).emit('webrtc_answer', { answer })` is called with the identical payload and `socket.emit` is never called with `webrtc_answer`

  - [ ]* 4.11 Write property test for `ice_candidate` relay — payload fidelity and no echo
    - **Property 11: ice_candidate relay — payload fidelity and no echo**
    - **Validates: Requirements 9.1, 9.2, 9.3**
    - Assert `socket.to(room).emit('ice_candidate', { candidate })` is called with the identical payload and `socket.emit` is never called with `ice_candidate`

- [x] 5. Checkpoint — Ensure all `socket.js` tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement `server/index.js` — server entry point
  - [x] 6.1 Wire Express, HTTP server, Socket.IO, and CORS together
    - Create Express app; attach to `node:http` server
    - Instantiate `Server` from `socket.io` with `cors: { origin: "http://localhost:5173" }`
    - Apply `cors({ origin: "http://localhost:5173" })` middleware to Express
    - Import and call `setupSocket(io)` from `socket.js`
    - Call `server.listen(PORT, callback)` and log the port; default `PORT` to `3001`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 10.1, 10.4_

  - [ ]* 6.2 Write smoke tests for server wiring
    - Server starts and accepts HTTP connections on the configured port
    - Socket.IO client can connect successfully
    - CORS headers are present for `http://localhost:5173`
    - `utils/users.js` exports `addUser`, `removeUser`, `getUser`, `getUsersInRoom`
    - `socket.js` exports a function
    - _Requirements: 1.1, 1.2, 1.3, 10.2, 10.3_

- [x] 7. Final checkpoint — Ensure all tests pass
  - Run the full test suite (`npm test`); ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at each module boundary
- Property tests validate universal correctness properties using fast-check (minimum 100 iterations each)
- Unit tests validate specific examples, boundaries, and edge cases
- The "no echo" assertion in relay property tests checks that `socket.emit` is never called with the relayed event name while `socket.to(room).emit` is called with the correct payload
