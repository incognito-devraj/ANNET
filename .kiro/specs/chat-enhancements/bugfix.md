# Bugfix Requirements Document

## Introduction

This document captures the requirements for four combined improvements to the Annet real-time chat application. Three of the changes fix missing or broken behavior (typing indicator, duplicate-nickname rejection, reaction cleanup), and one adds documentation. Together they improve user experience, data integrity, and code quality without altering any existing correct behavior.

---

## Bug Analysis

### Change 1 — Typing Indicator (Missing Feature)

#### Current Behavior (Defect)

1.1 WHEN a user types in the InputBar THEN the system does not emit any typing event to the server, so other users in the same room see no indication that someone is composing a message.

1.2 WHEN a user stops typing or sends a message THEN the system does not emit any stop-typing event, so any hypothetical indicator would never clear.

#### Expected Behavior (Correct)

2.1 WHEN a user types in the InputBar THEN the system SHALL emit a `typing` event (carrying the user's nickname and room) to the server, which SHALL broadcast it to all other users in the room, causing a "X is typing…" indicator to appear in the chat UI.

2.2 WHEN a user stops typing (debounced ~1.5 s of inactivity) or sends a message THEN the system SHALL emit a `stop_typing` event, which SHALL broadcast to the room and cause the typing indicator to disappear.

2.3 WHEN multiple users are typing simultaneously THEN the system SHALL display all of their names in the typing indicator (e.g. "Alice and Bob are typing…").

#### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user sends a message THEN the system SHALL CONTINUE TO emit `send_message` and display the message in all clients' chat windows exactly as before.

3.2 WHEN a user joins or leaves a room THEN the system SHALL CONTINUE TO broadcast `user_joined` / `user_left` and update the user list exactly as before.

---

### Change 2 — Remove Message Reactions (Cleanup / Removal)

#### Current Behavior (Defect)

1.3 WHEN a message is rendered THEN the system displays a 😊 reaction button and an `EmojiPicker` component that are client-side only (reactions are never synced to the server or other users), making the feature misleading and inconsistent.

1.4 WHEN a user picks an emoji reaction THEN the system updates local state only; other users in the room never see the reaction, creating a false impression of shared interaction.

#### Expected Behavior (Correct)

2.4 WHEN a message is rendered THEN the system SHALL NOT display any reaction button, `EmojiPicker`, or `ReactionBar` component.

2.5 WHEN `MessageBubble` is rendered THEN the system SHALL NOT accept or use an `onReact` prop.

2.6 WHEN the `ChatMessage` type is used THEN the system SHALL NOT include a `reactions` field or a `Reaction` type in `chat.ts`.

#### Unchanged Behavior (Regression Prevention)

3.3 WHEN a user hovers over a message THEN the system SHALL CONTINUE TO display the reply action button (the reactions button is removed; the reply button is kept).

3.4 WHEN a user clicks the reply button THEN the system SHALL CONTINUE TO populate the reply-to preview in the InputBar exactly as before.

---

### Change 3 — Prevent Duplicate Nicknames in a Room (Missing Validation)

#### Current Behavior (Defect)

1.5 WHEN a user calls `join_room` with a nickname that is already taken by another active user in the same room THEN the system adds the duplicate user to the store without error, resulting in two users with the same nickname in the same room.

1.6 WHEN two users share the same nickname in a room THEN the system produces ambiguous `user_joined`, `user_left`, and message attribution events that cannot be distinguished by other clients.

#### Expected Behavior (Correct)

2.7 WHEN `addUser` is called with a nickname that already exists (case-sensitive match) in the target room THEN the system SHALL return `{ error: "Nickname already taken in this room." }` and SHALL NOT add the user to the store.

2.8 WHEN the server receives a `join_room` event and `addUser` returns a duplicate-nickname error THEN the system SHALL emit an `error` event to the originating socket with the message `"Nickname already taken in this room."` and SHALL NOT call `socket.join(room)`.

2.9 WHEN the frontend receives an `error` event during the join flow THEN the system SHALL display the error message to the user on the nickname entry screen so they can choose a different name.

#### Unchanged Behavior (Regression Prevention)

3.5 WHEN a user joins a room with a nickname that is not already taken in that room THEN the system SHALL CONTINUE TO add the user, broadcast `user_joined`, and emit `room_users` exactly as before.

3.6 WHEN a user joins a room with a nickname that is taken in a *different* room THEN the system SHALL CONTINUE TO allow the join, because uniqueness is scoped per room.

3.7 WHEN `addUser` is called with a nickname that violates length or character rules THEN the system SHALL CONTINUE TO return the existing validation errors unchanged.

---

### Change 4 — README Files (Documentation Addition)

#### Current Behavior (Defect)

1.7 WHEN a developer visits the frontend or backend repository THEN the system provides no meaningful README, making onboarding, local setup, and deployment guidance unavailable.

#### Expected Behavior (Correct)

2.10 WHEN a developer visits `frontend/instant-chat/README.md` THEN the system SHALL provide a well-styled GitHub README covering: project overview, features, tech stack (React 18 / TypeScript / Vite / Tailwind / shadcn/ui / Socket.IO client), local development setup, Vercel deployment instructions, and future aspects (cloud message storage for persistent rooms, authentication & authorization for scaling).

2.11 WHEN a developer visits `server/README.md` THEN the system SHALL provide a well-styled GitHub README covering: project overview, architecture, Socket.IO events API reference, local development setup, Render deployment instructions, and future aspects (cloud message storage for persistent rooms, authentication & authorization for scaling).

#### Unchanged Behavior (Regression Prevention)

3.8 WHEN any existing source file is read THEN the system SHALL CONTINUE TO function identically — README additions are documentation only and SHALL NOT alter any runtime behavior.

---

## Bug Condition Pseudocode

### Change 1 — Typing Indicator

```pascal
FUNCTION isBugCondition_Typing(X)
  INPUT: X of type UserAction
  OUTPUT: boolean
  RETURN X.action = "keystroke_in_input_bar"
END FUNCTION

// Property: Fix Checking — Typing event emitted
FOR ALL X WHERE isBugCondition_Typing(X) DO
  result ← InputBar'(X)
  ASSERT socket_emitted("typing", { name: X.user, room: X.room })
END FOR

// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition_Typing(X) DO
  ASSERT InputBar(X) = InputBar'(X)
END FOR
```

### Change 2 — Reaction Removal

```pascal
FUNCTION isBugCondition_Reactions(X)
  INPUT: X of type RenderedMessage
  OUTPUT: boolean
  RETURN X.kind IN { "message", "code", "image", "file_offer" }
END FUNCTION

// Property: Fix Checking — No reaction UI rendered
FOR ALL X WHERE isBugCondition_Reactions(X) DO
  result ← MessageBubble'(X)
  ASSERT NOT contains(result, EmojiPicker)
    AND NOT contains(result, ReactionBar)
    AND NOT contains(result, reaction_button)
END FOR
```

### Change 3 — Duplicate Nickname

```pascal
FUNCTION isBugCondition_DuplicateNick(X)
  INPUT: X of type JoinAttempt
  OUTPUT: boolean
  RETURN EXISTS u IN users WHERE u.room = X.room AND u.name = X.name
END FUNCTION

// Property: Fix Checking — Duplicate rejected
FOR ALL X WHERE isBugCondition_DuplicateNick(X) DO
  result ← addUser'(X.id, X.name, X.room)
  ASSERT result.error = "Nickname already taken in this room."
    AND store_unchanged()
END FOR

// Property: Preservation Checking — Non-duplicate still accepted
FOR ALL X WHERE NOT isBugCondition_DuplicateNick(X) DO
  ASSERT addUser(X.id, X.name, X.room) = addUser'(X.id, X.name, X.room)
END FOR
```
