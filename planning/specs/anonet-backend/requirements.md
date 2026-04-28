# Requirements Document

## Introduction

Anonet is a real-time chat backend built with Node.js, Express.js, and Socket.IO. It supports room-based messaging, user presence tracking, and WebRTC signaling for peer-to-peer file transfer. All state is held in-memory — no database or authentication is required.

## Glossary

- **Server**: The Node.js/Express HTTP server that hosts the Socket.IO instance.
- **Socket**: A single persistent WebSocket connection between a client and the Server.
- **User**: An in-memory record representing a connected client, identified by socket ID, nickname, and room.
- **Room**: A named channel that groups one or more Users for messaging.
- **Nickname**: A display name chosen by the User, subject to format constraints.
- **User_Manager**: The module (`utils/users.js`) responsible for all in-memory User CRUD operations.
- **Socket_Handler**: The module (`socket.js`) that registers and processes all Socket.IO events.
- **WebRTC_Signaling**: The relay of WebRTC offer/answer/ICE messages between peers via the Server without the Server inspecting or storing media or file data.

---

## Requirements

### Requirement 1: Server Initialisation

**User Story:** As a frontend developer, I want the backend server to start and accept Socket.IO connections, so that clients can connect and communicate in real time.

#### Acceptance Criteria

1. THE Server SHALL create an Express application and attach it to a Node.js HTTP server.
2. THE Server SHALL attach a Socket.IO instance to the HTTP server.
3. THE Server SHALL enable CORS for the origin `http://localhost:5173` on both the Express application and the Socket.IO instance.
4. WHEN the Server starts, THE Server SHALL log the port it is listening on to the console.

---

### Requirement 2: User Management

**User Story:** As a developer, I want a dedicated in-memory user store, so that the Server can track which users are in which rooms without a database.

#### Acceptance Criteria

1. THE User_Manager SHALL maintain an in-memory collection of User records, where each record contains `id` (socket ID), `name` (nickname), and `room` (room name).
2. WHEN `addUser` is called with a socket ID, nickname, and room name, THE User_Manager SHALL add a new User record to the collection and return the created User.
3. WHEN `removeUser` is called with a socket ID, THE User_Manager SHALL remove the matching User record from the collection and return the removed User.
4. WHEN `getUser` is called with a socket ID, THE User_Manager SHALL return the matching User record, or `undefined` if no match exists.
5. WHEN `getUsersInRoom` is called with a room name, THE User_Manager SHALL return an array of all User records whose `room` field matches the given room name.

---

### Requirement 3: Nickname Validation

**User Story:** As a chat participant, I want my nickname to be validated before I join a room, so that display names are consistent and safe.

#### Acceptance Criteria

1. THE User_Manager SHALL reject any nickname that exceeds 24 characters and return a descriptive error message.
2. THE User_Manager SHALL reject any nickname that contains characters other than letters (a–z, A–Z), digits (0–9), or underscores, and return a descriptive error message.
3. WHEN a nickname fails validation, THE Socket_Handler SHALL emit an `error` event to the originating Socket containing the validation error message.
4. WHEN a nickname passes validation, THE Socket_Handler SHALL proceed with adding the User and joining the room.

---

### Requirement 4: Room Join

**User Story:** As a chat participant, I want to join a named room, so that I can exchange messages only with others in the same room.

#### Acceptance Criteria

1. WHEN a Socket emits `join_room` with `{ name, room }`, THE Socket_Handler SHALL validate the nickname using the User_Manager.
2. WHEN the nickname is valid, THE Socket_Handler SHALL call `addUser` and subscribe the Socket to the named Socket.IO room.
3. WHEN a User joins a room, THE Socket_Handler SHALL emit `user_joined` with `{ name }` to all Sockets in that room.
4. WHEN a User joins a room, THE Socket_Handler SHALL emit `room_users` with the current array of Users in that room to all Sockets in that room.
5. WHEN `join_room` is received, THE Socket_Handler SHALL log the event details to the console.

---

### Requirement 5: Real-Time Messaging

**User Story:** As a chat participant, I want to send messages to everyone else in my room, so that I can communicate in real time.

#### Acceptance Criteria

1. WHEN a Socket emits `send_message` with `{ room, author, message }`, THE Socket_Handler SHALL broadcast a `receive_message` event containing `{ room, author, message }` to all other Sockets in the specified room.
2. THE Socket_Handler SHALL NOT echo the `receive_message` event back to the originating Socket.
3. WHEN `send_message` is received, THE Socket_Handler SHALL log the event details to the console.

---

### Requirement 6: User Disconnect

**User Story:** As a chat participant, I want the room to be notified when someone leaves, so that the user list stays accurate.

#### Acceptance Criteria

1. WHEN a Socket disconnects, THE Socket_Handler SHALL call `removeUser` with the disconnected socket ID.
2. WHEN a User is found and removed, THE Socket_Handler SHALL emit `user_left` with `{ name }` to all remaining Sockets in the User's room.
3. WHEN a User is found and removed, THE Socket_Handler SHALL emit `room_users` with the updated array of Users in that room to all remaining Sockets in that room.
4. WHEN a Socket disconnects, THE Socket_Handler SHALL log the disconnection to the console.

---

### Requirement 7: WebRTC Offer Signaling

**User Story:** As a file sender, I want to relay a WebRTC offer to peers in my room, so that a peer-to-peer connection can be established for file transfer.

#### Acceptance Criteria

1. WHEN a Socket emits `webrtc_offer` with `{ room, offer, fileMeta: { name, size } }`, THE Socket_Handler SHALL broadcast a `webrtc_offer` event containing `{ offer, fileMeta }` to all other Sockets in the specified room.
2. THE Server SHALL NOT store, inspect, or modify the `offer` payload or `fileMeta` contents.
3. THE Socket_Handler SHALL NOT echo the `webrtc_offer` event back to the originating Socket.

---

### Requirement 8: WebRTC Answer Signaling

**User Story:** As a file receiver, I want to relay a WebRTC answer back to the sender, so that the peer-to-peer connection handshake can complete.

#### Acceptance Criteria

1. WHEN a Socket emits `webrtc_answer` with `{ room, answer }`, THE Socket_Handler SHALL broadcast a `webrtc_answer` event containing `{ answer }` to all other Sockets in the specified room.
2. THE Server SHALL NOT store, inspect, or modify the `answer` payload.
3. THE Socket_Handler SHALL NOT echo the `webrtc_answer` event back to the originating Socket.

---

### Requirement 9: ICE Candidate Signaling

**User Story:** As a chat participant involved in a file transfer, I want ICE candidates to be relayed between peers, so that the WebRTC connection can traverse NAT.

#### Acceptance Criteria

1. WHEN a Socket emits `ice_candidate` with `{ room, candidate }`, THE Socket_Handler SHALL broadcast an `ice_candidate` event containing `{ candidate }` to all other Sockets in the specified room.
2. THE Server SHALL NOT store, inspect, or modify the `candidate` payload.
3. THE Socket_Handler SHALL NOT echo the `ice_candidate` event back to the originating Socket.

---

### Requirement 10: Code Organisation

**User Story:** As a backend developer, I want the code split into focused modules, so that the codebase is easy to maintain and extend.

#### Acceptance Criteria

1. THE Server SHALL expose its entry point in `server/index.js`, which SHALL only initialise Express, the HTTP server, Socket.IO, and start listening.
2. THE Socket_Handler SHALL be implemented in `server/socket.js` and exported as a function that accepts the Socket.IO instance.
3. THE User_Manager SHALL be implemented in `server/utils/users.js` and export the four functions: `addUser`, `removeUser`, `getUser`, and `getUsersInRoom`.
4. THE Server SHALL contain no file storage, database connections, or authentication logic.
