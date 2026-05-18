# Chat Enhancements Bugfix Design

## Overview

This document covers four combined improvements to the Annet real-time chat application. Three address missing or broken behavior — a typing indicator, removal of the misleading client-only reaction system, and duplicate-nickname prevention — and one adds developer documentation (README files). The fix strategy is minimal and targeted: each change touches only the files and code paths required, with no collateral modifications to unrelated behavior.

---

## Glossary

- **Bug_Condition (C)**: The condition that identifies a defective input or state — e.g., a keystroke with no `typing` event emitted, a rendered message that still shows reaction UI, or a `join_room` call with a duplicate nickname.
- **Property (P)**: The desired correct behavior when the bug condition holds — e.g., `typing` is emitted, reaction UI is absent, or `addUser` returns an error.
- **Preservation**: Existing correct behaviors that must remain unchanged after each fix — message sending, reply button, valid-nickname joins, etc.
- **`addUser`**: The function in `server/utils/users.js` that validates and inserts a user into the in-memory store.
- **`InputBar`**: The React component in `frontend/instant-chat/src/components/chat/InputBar.tsx` that handles text input and file attachment.
- **`MessageBubble`**: The React component in `frontend/instant-chat/src/components/chat/MessageBubble.tsx` that renders a single chat message.
- **`Chat.tsx`**: The page component in `frontend/instant-chat/src/pages/Chat.tsx` that owns socket event registration, message state, and renders the full chat UI.
- **`chat.ts`**: The type definitions file at `frontend/instant-chat/src/types/chat.ts` that defines `ChatMessage`, `Reaction`, `ReplyTo`, etc.
- **`socket.js`**: The server-side event handler file at `server/socket.js` that registers all Socket.IO event listeners.
- **`typingUsers`**: A `Map<string, string>` (or `string[]`) of nicknames currently typing in the room, maintained in `Chat.tsx` state.
- **debounce**: A technique to delay emitting `stop_typing` until ~1.5 s of input inactivity, preventing excessive socket events.

---

## Bug Details

### Change 1 — Typing Indicator

#### Bug Condition

The bug manifests when a user types in the `InputBar`. The component does not emit any `typing` socket event, so other users in the room receive no indication that someone is composing a message. Likewise, no `stop_typing` event is ever emitted, so any indicator would never clear.

**Formal Specification:**
```
FUNCTION isBugCondition_Typing(X)
  INPUT: X of type UserAction
  OUTPUT: boolean

  RETURN X.action = "keystroke_in_input_bar"
         AND socket_emitted("typing", { name: X.user, room: X.room }) = FALSE
END FUNCTION
```

#### Examples

- User "Alice" types "hello" in room "general" → no `typing` event is emitted → Bob sees no indicator. *(Bug)*
- Alice sends a message → no `stop_typing` event is emitted → indicator would never clear. *(Bug)*
- Alice is idle for 1.5 s → no `stop_typing` event is emitted. *(Bug)*
- Bob is not typing → no indicator should appear → correct (no regression needed here).

---

### Change 2 — Remove Message Reactions

#### Bug Condition

The bug manifests whenever any non-system message is rendered. `MessageBubble` renders a 😊 reaction button, `EmojiPicker`, and `ReactionBar` that are purely client-side — reactions are never sent to the server or other users, creating a false impression of shared interaction.

**Formal Specification:**
```
FUNCTION isBugCondition_Reactions(X)
  INPUT: X of type RenderedMessage
  OUTPUT: boolean

  RETURN X.kind IN { "message", "code", "image", "file_offer" }
         AND (renders(EmojiPicker) OR renders(ReactionBar) OR renders(reaction_button))
END FUNCTION
```

#### Examples

- A `kind: "message"` bubble is rendered → 😊 button appears → user picks emoji → only local state updates, other users see nothing. *(Bug)*
- A `kind: "code"` bubble is rendered → `ReactionBar` is rendered below the code block. *(Bug)*
- A `kind: "system"` bubble is rendered → no reaction UI → correct (no change needed).
- Reply button is rendered on hover → must remain after fix. *(Preservation)*

---

### Change 3 — Duplicate Nickname Prevention

#### Bug Condition

The bug manifests when `addUser` is called with a nickname that already exists (case-sensitive) in the same room. The function currently skips this check and inserts the duplicate, producing two users with identical names.

**Formal Specification:**
```
FUNCTION isBugCondition_DuplicateNick(X)
  INPUT: X of type JoinAttempt { id, name, room }
  OUTPUT: boolean

  RETURN EXISTS u IN users
         WHERE u.room = X.room
           AND u.name = X.name
END FUNCTION
```

#### Examples

- "Alice" is in room "general"; a new socket calls `join_room` with name "Alice", room "general" → duplicate inserted → two "Alice" entries. *(Bug)*
- "Alice" is in room "general"; "Alice" tries to join room "lobby" → different room → should be allowed. *(Preservation)*
- "Alice" is in room "general"; "alice" (lowercase) tries to join → different name (case-sensitive) → should be allowed. *(Preservation)*
- "Bob" joins room "general" with no existing "Bob" → normal join → should proceed unchanged. *(Preservation)*
- Frontend receives `error` event before `joined` is set → error must appear on the nickname screen, not just as a toast. *(Bug — frontend gap)*

---

### Change 4 — README Files

#### Bug Condition

No meaningful README exists for either the frontend or backend sub-project, making onboarding and deployment guidance unavailable.

**Formal Specification:**
```
FUNCTION isBugCondition_README(X)
  INPUT: X of type DeveloperVisit { path }
  OUTPUT: boolean

  RETURN X.path IN { "frontend/instant-chat/README.md", "server/README.md" }
         AND file_is_missing_or_empty(X.path)
END FUNCTION
```

#### Examples

- Developer clones repo, opens `frontend/instant-chat/` → no README → cannot determine setup steps. *(Bug)*
- Developer opens `server/` → no README → cannot determine Socket.IO event API. *(Bug)*

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- **Message sending**: `send_message` socket event and local message append must work exactly as before.
- **Reply button**: Hovering a message must still show the reply (↩) button; clicking it must still populate the reply-to strip in `InputBar`.
- **File transfer**: WebRTC offer/answer/ICE flow and inline image relay must be unaffected.
- **Valid-nickname join**: A `join_room` with a unique nickname must still add the user, broadcast `user_joined`, and emit `room_users`.
- **Cross-room nickname reuse**: The same nickname in a different room must still be accepted.
- **Existing nickname validation**: Length and character-pattern checks in `addUser` must remain unchanged.
- **System messages**: `user_joined` / `user_left` system messages must continue to appear.
- **Connection / reconnection**: Socket connect/disconnect/reconnect behavior must be unaffected.
- **Runtime behavior**: Adding README files must not alter any runtime behavior.

**Scope:**

All inputs that do NOT match the four bug conditions above should be completely unaffected by these fixes. This includes:
- Mouse clicks on buttons (not typing events)
- Non-number-key keyboard inputs unrelated to the InputBar
- File drag-and-drop and paste behavior in `InputBar`
- All existing socket events other than the new `typing` / `stop_typing` pair

---

## Hypothesized Root Cause

### Change 1 — Typing Indicator

1. **Missing socket emissions in `InputBar`**: The `onChange` handler updates `value` state but never calls `socket.emit("typing", ...)`. No debounce timer exists to emit `stop_typing`.
2. **Missing server handlers in `socket.js`**: No `typing` or `stop_typing` event handlers are registered, so even if the client emitted them, the server would not broadcast them.
3. **Missing client listeners in `Chat.tsx`**: No `socket.on("typing", ...)` or `socket.on("stop_typing", ...)` handlers exist, so the UI has no way to display the indicator.
4. **Missing `TypingIndicator` component**: No component exists to render "X is typing…" text above the `InputBar`.

### Change 2 — Remove Message Reactions

1. **`EmojiPicker`, `ReactionBar`, `EMOJI_LIST`, and `Reaction` type exist in the codebase** but reactions are never synced to the server, making them misleading.
2. **`onReact` prop is threaded through `Chat.tsx` → `MessageBubble`** and the `handleReact` callback updates only local state.
3. **`reactions` field exists on all non-system `ChatMessage` variants** in `chat.ts`, adding unnecessary type surface.

### Change 3 — Duplicate Nickname Prevention

1. **`addUser` in `server/utils/users.js` has no duplicate-name-in-room check**: After length and character validation, it pushes the user unconditionally.
2. **Frontend `onError` handler in `Chat.tsx` calls `toast.error(text)` but only after `joined` is `true`**: The error event arrives before `setJoined(true)` is called (the socket emits the error before the client sets `joined`), so the toast may not be visible or the user is still on the nickname screen with no inline error feedback.

### Change 4 — README Files

1. **Files simply do not exist** (or contain only placeholder content). No logic change is needed — only file creation.

---

## Correctness Properties

Property 1: Bug Condition — Typing Events Are Emitted

_For any_ user action where `isBugCondition_Typing` holds (a keystroke occurs in the InputBar), the fixed `InputBar` component SHALL emit a `typing` socket event carrying `{ name, room }` to the server, and the server SHALL broadcast it to all other users in the room. After ~1.5 s of inactivity or on message send, a `stop_typing` event SHALL be emitted and broadcast, causing the typing indicator to disappear.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation — Non-Typing Input Behavior Unchanged

_For any_ user action where `isBugCondition_Typing` does NOT hold (e.g., clicking send, attaching a file, switching tabs), the fixed `InputBar` and `Chat.tsx` SHALL produce exactly the same behavior as the original code, preserving all existing message-send, file-transfer, and reply functionality.

**Validates: Requirements 3.1, 3.2**

Property 3: Bug Condition — Reaction UI Is Absent

_For any_ rendered non-system message where `isBugCondition_Reactions` holds, the fixed `MessageBubble` SHALL NOT render `EmojiPicker`, `ReactionBar`, or the 😊 reaction button. The `onReact` prop SHALL NOT exist on `MessageBubble`. The `reactions` field and `Reaction` type SHALL NOT exist in `chat.ts`.

**Validates: Requirements 2.4, 2.5, 2.6**

Property 4: Preservation — Reply Button and Other Message Bubble Behavior Unchanged

_For any_ rendered non-system message, the fixed `MessageBubble` SHALL continue to render the reply button on hover and invoke `onReply` when clicked, preserving all existing message display, code highlighting, file card, and image rendering behavior.

**Validates: Requirements 3.3, 3.4**

Property 5: Bug Condition — Duplicate Nickname Is Rejected

_For any_ `JoinAttempt` where `isBugCondition_DuplicateNick` holds (same name, same room already in store), the fixed `addUser` SHALL return `{ error: "Nickname already taken in this room." }` and SHALL NOT mutate the users store. The server SHALL emit `error` to the originating socket and SHALL NOT call `socket.join(room)`. The frontend SHALL display the error on the nickname entry screen.

**Validates: Requirements 2.7, 2.8, 2.9**

Property 6: Preservation — Non-Duplicate Join Behavior Unchanged

_For any_ `JoinAttempt` where `isBugCondition_DuplicateNick` does NOT hold (unique name in room, or same name in a different room), the fixed `addUser` SHALL produce exactly the same result as the original `addUser`, preserving the full join flow including `user_joined` broadcast and `room_users` emission.

**Validates: Requirements 3.5, 3.6, 3.7**

---

## Fix Implementation

### Change 1 — Typing Indicator

**File**: `frontend/instant-chat/src/components/chat/InputBar.tsx`

**Specific Changes:**
1. **Add `onTyping` and `onStopTyping` props** to the `Props` type.
2. **Emit `typing` on `onChange`**: Call `onTyping()` whenever the textarea value changes (non-empty).
3. **Debounce `stop_typing`**: Use a `useRef` timer that resets on each keystroke and fires `onStopTyping()` after ~1.5 s of inactivity.
4. **Emit `stop_typing` on send**: Call `onStopTyping()` inside the `send()` function immediately after dispatching the message.

**File**: `server/socket.js`

**Specific Changes:**
1. **Add `typing` handler**: `socket.on("typing", ({ name, room }) => socket.to(room).emit("typing", { name }))` — broadcasts to room excluding sender.
2. **Add `stop_typing` handler**: `socket.on("stop_typing", ({ name, room }) => socket.to(room).emit("stop_typing", { name }))` — broadcasts to room excluding sender.

**File**: `frontend/instant-chat/src/pages/Chat.tsx`

**Specific Changes:**
1. **Add `typingUsers` state**: `const [typingUsers, setTypingUsers] = useState<string[]>([])`.
2. **Register `typing` listener**: Append the typing user's name to `typingUsers` (avoid duplicates).
3. **Register `stop_typing` listener**: Remove the user's name from `typingUsers`.
4. **Pass `onTyping` / `onStopTyping` to `InputBar`**: Wire socket emissions using `name` and `room`.
5. **Render `TypingIndicator`**: Display above the `InputBar` compose area, showing "X is typing…" or "X and Y are typing…".

**New Component**: `frontend/instant-chat/src/components/chat/TypingIndicator.tsx`

**Specific Changes:**
1. Accept `typingUsers: string[]` prop.
2. Return `null` when the array is empty.
3. Format: one user → "Alice is typing…"; two → "Alice and Bob are typing…"; three+ → "Alice, Bob and 2 others are typing…".
4. Include an animated three-dot pulse for visual polish.

---

### Change 2 — Remove Message Reactions

**File**: `frontend/instant-chat/src/components/chat/MessageBubble.tsx`

**Specific Changes:**
1. **Remove `EmojiPicker` component** (entire function definition).
2. **Remove `ReactionBar` component** (entire function definition).
3. **Remove `EMOJI_LIST` constant**.
4. **Remove `Reaction` import** from `@/types/chat`.
5. **Remove `onReact` prop** from `MessageBubble` props type.
6. **Remove `showPicker` state** and all references.
7. **Remove the `onReact` branch** from `actionBar` (the 😊 button and `EmojiPicker` render).
8. **Remove `ReactionBar` usages** from the `code` and default render paths.
9. **Remove `reactions` local variable** (`const reactions = "reactions" in msg ? ...`).

**File**: `frontend/instant-chat/src/types/chat.ts`

**Specific Changes:**
1. **Remove `Reaction` type** export.
2. **Remove `reactions?: Record<string, Reaction>` field** from all four non-system `ChatMessage` variants (`message`, `code`, `file_offer`, `image`).

**File**: `frontend/instant-chat/src/pages/Chat.tsx`

**Specific Changes:**
1. **Remove `handleReact` callback** entirely.
2. **Remove `onReact={handleReact}` prop** from the `<MessageBubble>` render call.

---

### Change 3 — Duplicate Nickname Prevention

**File**: `server/utils/users.js`

**Specific Changes:**
1. **Add duplicate check** after the existing character-pattern validation and before `users.push(user)`:
   ```js
   const duplicate = users.find((u) => u.room === room && u.name === name);
   if (duplicate) {
     return { error: "Nickname already taken in this room." };
   }
   ```

**File**: `frontend/instant-chat/src/pages/Chat.tsx`

**Specific Changes:**
1. **Add `nameError` listener for the pre-join phase**: The existing `onError` handler fires `toast.error(text)` but the user is still on the nickname screen. Modify the handler (or add a separate pre-join path) so that when `joined` is `false` at the time the error arrives, it calls `setNameError(text)` instead of (or in addition to) the toast, surfacing the error inline on the nickname form.
2. **Reset `hasJoinedRoom` guard on error**: Ensure the join guard is reset so the user can retry after fixing their nickname.

---

### Change 4 — README Files

**File**: `frontend/instant-chat/README.md`

Create a GitHub-style README covering: project overview, feature list, tech stack (React 18 / TypeScript / Vite / Tailwind CSS / shadcn/ui / Socket.IO client 4.x), local development setup, Vercel deployment, environment variables, and future roadmap (cloud message storage, auth/authz).

**File**: `server/README.md`

Create a GitHub-style README covering: project overview, architecture (Node.js / Express 5 / Socket.IO 4 / in-memory store), Socket.IO events API reference table (event name, direction, payload, description), local development setup, Render deployment, environment variables, and future roadmap (cloud message storage, auth/authz).

---

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach for each change: first, surface counterexamples that demonstrate the bug on unfixed code (exploratory), then verify the fix works correctly and preserves existing behavior (fix checking + preservation checking).

---

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate each bug BEFORE implementing the fix. Confirm or refute the root cause analysis.

**Test Cases:**

1. **Typing — No event emitted** *(will fail on unfixed code)*: Simulate a `change` event on the `InputBar` textarea and assert that `socket.emit` was called with `"typing"`. On unfixed code, no such call occurs.
2. **Typing — No stop event on idle** *(will fail on unfixed code)*: Simulate typing then wait 1.5 s and assert `socket.emit` was called with `"stop_typing"`. On unfixed code, no such call occurs.
3. **Reactions — EmojiPicker rendered** *(will fail on unfixed code)*: Render a `MessageBubble` with `kind: "message"` and assert that no 😊 button or `EmojiPicker` is present. On unfixed code, the button is present.
4. **Duplicate nick — Store accepts duplicate** *(will fail on unfixed code)*: Call `addUser("id1", "Alice", "general")` then `addUser("id2", "Alice", "general")` and assert the second call returns `{ error: "Nickname already taken in this room." }`. On unfixed code, both calls succeed.
5. **Duplicate nick — Frontend shows inline error** *(will fail on unfixed code)*: Simulate the `error` socket event arriving while `joined === false` and assert `nameError` state is set. On unfixed code, only a toast fires (if at all).

**Expected Counterexamples:**
- `socket.emit` is never called with `"typing"` or `"stop_typing"` from `InputBar`.
- `EmojiPicker` and `ReactionBar` are present in rendered `MessageBubble` output.
- `addUser` returns a user object (not an error) for a duplicate nickname.
- `nameError` remains `null` after an `error` event arrives pre-join.

---

### Fix Checking

**Goal**: Verify that for all inputs where each bug condition holds, the fixed code produces the expected behavior.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition_Typing(X) DO
  result ← InputBar_fixed(X)
  ASSERT socket_emitted("typing", { name: X.user, room: X.room })
END FOR

FOR ALL X WHERE isBugCondition_Reactions(X) DO
  result ← MessageBubble_fixed(X)
  ASSERT NOT contains(result, EmojiPicker)
    AND NOT contains(result, ReactionBar)
    AND NOT contains(result, reaction_button)
END FOR

FOR ALL X WHERE isBugCondition_DuplicateNick(X) DO
  result ← addUser_fixed(X.id, X.name, X.room)
  ASSERT result.error = "Nickname already taken in this room."
    AND store_unchanged()
END FOR
```

---

### Preservation Checking

**Goal**: Verify that for all inputs where each bug condition does NOT hold, the fixed code produces the same result as the original code.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition_Typing(X) DO
  ASSERT InputBar_original(X) = InputBar_fixed(X)
END FOR

FOR ALL X WHERE NOT isBugCondition_DuplicateNick(X) DO
  ASSERT addUser_original(X.id, X.name, X.room) = addUser_fixed(X.id, X.name, X.room)
END FOR
```

**Testing Approach**: Property-based testing is recommended for `addUser` preservation checking because:
- It generates many random `(id, name, room)` combinations automatically.
- It catches edge cases (empty strings, max-length names, special characters) that manual tests might miss.
- It provides strong guarantees that non-duplicate joins are unaffected across the full input domain.

**Test Plan**: Observe behavior on UNFIXED code first for valid (non-duplicate) joins, then write property-based tests capturing that behavior.

**Test Cases:**
1. **Valid join preservation**: Generate random unique nicknames and assert `addUser_fixed` returns the same `{ id, name, room }` object as `addUser_original`.
2. **Cross-room same-name preservation**: Assert that `addUser_fixed("id2", "Alice", "lobby")` succeeds when "Alice" is already in "general".
3. **Existing validation preservation**: Assert that length and character errors are still returned unchanged.
4. **Reply button preservation**: Render `MessageBubble_fixed` and assert the reply button is still present on hover.
5. **Message send preservation**: Assert `send_message` socket event is still emitted correctly after the typing-indicator changes.

---

### Unit Tests

- Test `addUser` with a duplicate name in the same room → expect `{ error: "Nickname already taken in this room." }`.
- Test `addUser` with the same name in a different room → expect success.
- Test `addUser` with a unique name → expect the user object (unchanged behavior).
- Test `InputBar` `onChange` → expect `onTyping` called; after 1.5 s inactivity → expect `onStopTyping` called.
- Test `InputBar` send → expect `onStopTyping` called immediately.
- Test `MessageBubble` renders without 😊 button, `EmojiPicker`, or `ReactionBar`.
- Test `MessageBubble` still renders the reply button.
- Test `TypingIndicator` with 0, 1, 2, and 3+ users.

### Property-Based Tests

- Generate random `(id, name, room)` triples where no duplicate exists → assert `addUser_fixed` always returns a user object matching the input.
- Generate random message objects of each `kind` → assert `MessageBubble_fixed` never renders reaction UI.
- Generate random sequences of typing/stop-typing events → assert `typingUsers` state in `Chat.tsx` is always a subset of current room users and never contains the local user's own name.

### Integration Tests

- Full join flow: two clients join the same room with the same nickname → second client sees inline error on nickname screen.
- Full typing flow: Client A types → Client B sees "A is typing…" → A sends → indicator disappears on B.
- Full reaction-removal flow: render a full chat session and assert no reaction UI appears anywhere.
- Cross-room join: "Alice" in "general", "Alice" joins "lobby" → both succeed, no error.
