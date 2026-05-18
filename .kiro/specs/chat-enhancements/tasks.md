# Implementation Plan

- [x] 1. Write bug condition exploration tests (BEFORE implementing any fix)
  - **Property 1: Bug Condition** - Typing Events, Reaction UI, Duplicate Nickname, and Frontend Error Display
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode the expected behavior — they will validate the fixes when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate each bug exists
  - **Scoped PBT Approach**: For deterministic bugs, scope the property to the concrete failing case(s) to ensure reproducibility

  - **Test 1a — Typing: no `typing` event emitted**
    - Render `InputBar` with a mock `socket.emit` spy
    - Simulate a `change` event on the textarea (non-empty value)
    - Assert `socket.emit` was called with `"typing"` and `{ name, room }`
    - Run on UNFIXED code — **EXPECTED OUTCOME: FAILS** (no emit call exists)
    - Document counterexample: `socket.emit` is never called with `"typing"` from `InputBar`

  - **Test 1b — Typing: no `stop_typing` event after inactivity**
    - Render `InputBar`, simulate typing, advance fake timers by 1500 ms
    - Assert `socket.emit` was called with `"stop_typing"` and `{ name, room }`
    - Run on UNFIXED code — **EXPECTED OUTCOME: FAILS** (no debounce timer exists)
    - Document counterexample: `socket.emit` is never called with `"stop_typing"`

  - **Test 1c — Reactions: EmojiPicker / ReactionBar rendered**
    - Render `MessageBubble` with `kind: "message"` props
    - Assert that no 😊 button, `EmojiPicker`, or `ReactionBar` is present in the output
    - Run on UNFIXED code — **EXPECTED OUTCOME: FAILS** (reaction UI is present)
    - Document counterexample: 😊 button and `EmojiPicker` appear in rendered output

  - **Test 1d — Duplicate nickname: `addUser` accepts duplicate**
    - Call `addUser("id1", "Alice", "general")` then `addUser("id2", "Alice", "general")`
    - Assert the second call returns `{ error: "Nickname already taken in this room." }`
    - Run on UNFIXED code — **EXPECTED OUTCOME: FAILS** (both calls succeed, no error returned)
    - Document counterexample: `addUser` returns a user object instead of an error for the duplicate

  - **Test 1e — Duplicate nickname: frontend shows inline error pre-join**
    - Render `Chat.tsx` in the nickname-entry state (`joined === false`)
    - Simulate the `error` socket event arriving with `"Nickname already taken in this room."`
    - Assert `nameError` state is set to the error message (inline error visible on nickname screen)
    - Run on UNFIXED code — **EXPECTED OUTCOME: FAILS** (only a toast fires, `nameError` stays null)
    - Document counterexample: `nameError` remains `null` after the error event

  - Mark task complete when all five tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 2. Write preservation property tests (BEFORE implementing any fix)
  - **Property 2: Preservation** - Non-Typing Actions, Reply Button, and Non-Duplicate Joins
  - **IMPORTANT**: Follow observation-first methodology — observe UNFIXED code behavior first, then encode it
  - **GOAL**: Capture baseline behavior that must not regress after the fixes

  - **Test 2a — Message send is unaffected by typing changes**
    - Observe: `InputBar` send path calls `socket.emit("send_message", ...)` on unfixed code
    - Write property-based test: for any valid message text, `send_message` is emitted with the correct payload
    - Verify test PASSES on UNFIXED code

  - **Test 2b — Reply button still present after reaction removal**
    - Observe: `MessageBubble` renders a reply (↩) button on hover on unfixed code
    - Write test: render `MessageBubble` with `kind: "message"` and assert the reply button is present
    - Verify test PASSES on UNFIXED code

  - **Test 2c — Non-duplicate join succeeds (property-based)**
    - Observe: `addUser("id1", "Alice", "general")` returns `{ id: "id1", name: "Alice", room: "general" }` on unfixed code
    - Write property-based test: generate random unique `(id, name, room)` triples where no duplicate exists in the store; assert `addUser` returns a user object matching the input (not an error)
    - Verify test PASSES on UNFIXED code

  - **Test 2d — Cross-room same-name join succeeds**
    - Observe: `addUser("id2", "Alice", "lobby")` succeeds when "Alice" is already in "general" on unfixed code
    - Write test asserting the same-name-different-room case returns a user object
    - Verify test PASSES on UNFIXED code

  - **Test 2e — Existing `addUser` validation errors are unchanged**
    - Observe: `addUser` returns existing length/character errors on unfixed code
    - Write tests asserting those error messages are still returned after the fix
    - Verify tests PASS on UNFIXED code

  - Mark task complete when all preservation tests are written, run, and confirmed passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [x] 3. Implement Change 1 — Typing Indicator

  - [x] 3.1 Add `typing` and `stop_typing` handlers to `server/socket.js`
    - Add `socket.on("typing", ({ name, room }) => socket.to(room).emit("typing", { name }))` — broadcasts to room excluding sender
    - Add `socket.on("stop_typing", ({ name, room }) => socket.to(room).emit("stop_typing", { name }))` — broadcasts to room excluding sender
    - _Bug_Condition: isBugCondition_Typing(X) where X.action = "keystroke_in_input_bar" AND socket_emitted("typing") = FALSE_
    - _Expected_Behavior: server broadcasts "typing" / "stop_typing" to all other users in the room_
    - _Requirements: 2.1, 2.2_

  - [x] 3.2 Update `InputBar.tsx` to emit typing events with debounce
    - Add `onTyping: () => void` and `onStopTyping: () => void` to the `Props` type
    - Call `onTyping()` in the `onChange` handler whenever the textarea value is non-empty
    - Add a `useRef` debounce timer that resets on each keystroke and fires `onStopTyping()` after ~1500 ms of inactivity
    - Call `onStopTyping()` inside the `send()` function immediately after dispatching the message
    - Clear the debounce timer on component unmount
    - _Bug_Condition: isBugCondition_Typing(X) where X.action = "keystroke_in_input_bar"_
    - _Expected_Behavior: socket.emit("typing", { name, room }) on keystroke; socket.emit("stop_typing", { name, room }) after 1.5 s inactivity or on send_
    - _Requirements: 2.1, 2.2_

  - [x] 3.3 Create `TypingIndicator.tsx` component
    - Create `frontend/instant-chat/src/components/chat/TypingIndicator.tsx`
    - Accept `typingUsers: string[]` prop
    - Return `null` when the array is empty
    - Format: 1 user → "Alice is typing…"; 2 users → "Alice and Bob are typing…"; 3+ users → "Alice, Bob and N others are typing…"
    - Include an animated three-dot pulse (CSS animation) for visual polish
    - _Requirements: 2.1, 2.3_

  - [x] 3.4 Update `Chat.tsx` to manage `typingUsers` state and wire `InputBar`
    - Add `const [typingUsers, setTypingUsers] = useState<string[]>([])`
    - Register `socket.on("typing", ({ name }) => ...)` — append name to `typingUsers` (avoid duplicates)
    - Register `socket.on("stop_typing", ({ name }) => ...)` — remove name from `typingUsers`
    - Pass `onTyping` and `onStopTyping` callbacks to `<InputBar>` that call `socket.emit("typing", { name, room })` and `socket.emit("stop_typing", { name, room })`
    - Render `<TypingIndicator typingUsers={typingUsers} />` above the `InputBar` compose area
    - _Bug_Condition: isBugCondition_Typing(X) — no typing listener or typingUsers state existed_
    - _Expected_Behavior: typingUsers state reflects current typers; TypingIndicator renders "X is typing…"_
    - _Preservation: send_message, user_joined/user_left, file transfer, and reply flows are unaffected_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2_

  - [x] 3.5 Verify bug condition exploration tests for typing now pass
    - **Property 1: Expected Behavior** - Typing Events Are Emitted
    - **IMPORTANT**: Re-run the SAME tests from task 1 (tests 1a and 1b) — do NOT write new tests
    - Run test 1a: assert `socket.emit("typing", ...)` is called on `InputBar` `onChange`
    - Run test 1b: assert `socket.emit("stop_typing", ...)` is called after 1500 ms inactivity
    - **EXPECTED OUTCOME**: Both tests PASS (confirms typing indicator bug is fixed)
    - _Requirements: 2.1, 2.2_

  - [x] 3.6 Verify preservation tests for typing still pass
    - **Property 2: Preservation** - Non-Typing Input Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 (test 2a) — do NOT write new tests
    - Run test 2a: assert `send_message` is still emitted correctly from `InputBar`
    - **EXPECTED OUTCOME**: Test PASSES (confirms no regressions in message send)

- [x] 4. Implement Change 2 — Remove Message Reactions

  - [x] 4.1 Remove reaction types from `frontend/instant-chat/src/types/chat.ts`
    - Remove the `Reaction` type export
    - Remove the `reactions?: Record<string, Reaction>` field from all four non-system `ChatMessage` variants (`message`, `code`, `file_offer`, `image`)
    - _Bug_Condition: isBugCondition_Reactions(X) where X.kind IN { "message", "code", "image", "file_offer" } AND reactions field exists_
    - _Expected_Behavior: Reaction type and reactions field do not exist in chat.ts_
    - _Requirements: 2.6_

  - [x] 4.2 Strip reaction code from `MessageBubble.tsx`
    - Remove `EmojiPicker` component (entire function definition)
    - Remove `ReactionBar` component (entire function definition)
    - Remove `EMOJI_LIST` constant
    - Remove `Reaction` import from `@/types/chat`
    - Remove `onReact` prop from `MessageBubble` props type
    - Remove `showPicker` state and all references
    - Remove the 😊 button and `EmojiPicker` render from the `actionBar`
    - Remove `ReactionBar` usages from the `code` and default render paths
    - Remove the `reactions` local variable (`const reactions = "reactions" in msg ? ...`)
    - _Bug_Condition: isBugCondition_Reactions(X) — EmojiPicker, ReactionBar, and reaction button rendered for non-system messages_
    - _Expected_Behavior: No reaction UI rendered; onReact prop does not exist_
    - _Preservation: Reply button (↩) remains on hover; all other message rendering (code highlight, file card, image) is unchanged_
    - _Requirements: 2.4, 2.5, 3.3, 3.4_

  - [x] 4.3 Remove `handleReact` from `Chat.tsx`
    - Remove the `handleReact` callback entirely
    - Remove the `onReact={handleReact}` prop from the `<MessageBubble>` render call
    - _Bug_Condition: isBugCondition_Reactions(X) — onReact prop threaded through Chat.tsx_
    - _Expected_Behavior: handleReact and onReact prop do not exist_
    - _Requirements: 2.4, 2.5_

  - [x] 4.4 Verify bug condition exploration test for reactions now passes
    - **Property 1: Expected Behavior** - Reaction UI Is Absent
    - **IMPORTANT**: Re-run the SAME test from task 1 (test 1c) — do NOT write a new test
    - Run test 1c: render `MessageBubble` with `kind: "message"` and assert no 😊 button, `EmojiPicker`, or `ReactionBar` is present
    - **EXPECTED OUTCOME**: Test PASSES (confirms reaction removal bug is fixed)
    - _Requirements: 2.4, 2.5, 2.6_

  - [x] 4.5 Verify preservation tests for reactions still pass
    - **Property 2: Preservation** - Reply Button and Message Bubble Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME test from task 2 (test 2b) — do NOT write a new test
    - Run test 2b: assert the reply button is still present on hover in `MessageBubble`
    - **EXPECTED OUTCOME**: Test PASSES (confirms no regressions in message bubble behavior)
    - _Requirements: 3.3, 3.4_

- [ ] 5. Implement Change 3 — Duplicate Nickname Prevention

  - [x] 5.1 Add duplicate-name-in-room check to `server/utils/users.js` `addUser`
    - After the existing character-pattern validation and before `users.push(user)`, add:
      ```js
      const duplicate = users.find((u) => u.room === room && u.name === name);
      if (duplicate) {
        return { error: "Nickname already taken in this room." };
      }
      ```
    - The check is case-sensitive (matching the spec)
    - Do NOT alter any existing length or character-pattern validation logic
    - _Bug_Condition: isBugCondition_DuplicateNick(X) where EXISTS u IN users WHERE u.room = X.room AND u.name = X.name_
    - _Expected_Behavior: addUser returns { error: "Nickname already taken in this room." } and does not mutate the store_
    - _Preservation: All non-duplicate joins, cross-room same-name joins, and existing validation errors are unchanged_
    - _Requirements: 2.7, 3.5, 3.6, 3.7_

  - [x] 5.2 Update `socket.js` to emit `error` event on duplicate-nickname rejection
    - In the `join_room` handler, after calling `addUser`, check for `user.error`
    - If `user.error` is set, emit `socket.emit("error", user.error)` to the originating socket and return without calling `socket.join(room)`
    - _Bug_Condition: isBugCondition_DuplicateNick(X) — server did not emit error event on duplicate join_
    - _Expected_Behavior: server emits error to originating socket and does not call socket.join(room)_
    - _Requirements: 2.8_

  - [x] 5.3 Update `Chat.tsx` `onError` handler to show inline error on nickname screen
    - Modify the `onError` handler (or add a pre-join path) so that when `joined === false` at the time the error arrives, it calls `setNameError(text)` to surface the error inline on the nickname form
    - Ensure the join guard (`hasJoinedRoom` ref or equivalent) is reset on error so the user can retry
    - The existing `toast.error(text)` behavior for post-join errors should remain unchanged
    - _Bug_Condition: isBugCondition_DuplicateNick(X) — frontend onError only fired toast, nameError stayed null pre-join_
    - _Expected_Behavior: nameError is set when error arrives while joined === false; user sees inline error on nickname screen_
    - _Requirements: 2.9_

  - [x] 5.4 Verify bug condition exploration tests for duplicate nickname now pass
    - **Property 1: Expected Behavior** - Duplicate Nickname Is Rejected
    - **IMPORTANT**: Re-run the SAME tests from task 1 (tests 1d and 1e) — do NOT write new tests
    - Run test 1d: assert `addUser("id2", "Alice", "general")` returns `{ error: "Nickname already taken in this room." }` when "Alice" is already in "general"
    - Run test 1e: assert `nameError` is set when the `error` socket event arrives while `joined === false`
    - **EXPECTED OUTCOME**: Both tests PASS (confirms duplicate nickname bug is fixed)
    - _Requirements: 2.7, 2.8, 2.9_

  - [x] 5.5 Verify preservation tests for duplicate nickname still pass
    - **Property 2: Preservation** - Non-Duplicate Join Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 (tests 2c, 2d, 2e) — do NOT write new tests
    - Run test 2c: property-based test — random unique joins still return a user object
    - Run test 2d: cross-room same-name join still succeeds
    - Run test 2e: existing length/character validation errors are still returned unchanged
    - **EXPECTED OUTCOME**: All tests PASS (confirms no regressions in join flow)
    - _Requirements: 3.5, 3.6, 3.7_

- [x] 6. Implement Change 4 — README Files

  - [x] 6.1 Create `frontend/instant-chat/README.md`
    - Write a GitHub-style README covering:
      - Project overview and purpose
      - Feature list (real-time messaging, typing indicators, file transfer, WebRTC, rooms, nicknames)
      - Tech stack: React 18 / TypeScript / Vite / Tailwind CSS / shadcn/ui / Socket.IO client 4.x
      - Local development setup (prerequisites, install, env vars, `npm run dev`)
      - Vercel deployment instructions and environment variables
      - Future roadmap: cloud message storage for persistent rooms, authentication & authorization for scaling
    - _Bug_Condition: isBugCondition_README(X) where X.path = "frontend/instant-chat/README.md" AND file_is_missing_or_empty_
    - _Expected_Behavior: well-styled README exists at frontend/instant-chat/README.md_
    - _Requirements: 2.10, 3.8_

  - [x] 6.2 Create `server/README.md`
    - Write a GitHub-style README covering:
      - Project overview and architecture (Node.js / Express 5 / Socket.IO 4 / in-memory store)
      - Socket.IO events API reference table (event name, direction, payload, description) — include all existing events plus the new `typing` / `stop_typing` pair
      - Local development setup (prerequisites, install, env vars, `node index.js` or `npm start`)
      - Render deployment instructions and environment variables
      - Future roadmap: cloud message storage for persistent rooms, authentication & authorization for scaling
    - _Bug_Condition: isBugCondition_README(X) where X.path = "server/README.md" AND file_is_missing_or_empty_
    - _Expected_Behavior: well-styled README exists at server/README.md_
    - _Requirements: 2.11, 3.8_

- [x] 7. Checkpoint — Ensure all tests pass
  - Re-run the full test suite (unit + property-based tests)
  - Confirm all five bug condition exploration tests now PASS (tests 1a–1e)
  - Confirm all five preservation tests still PASS (tests 2a–2e)
  - Confirm no TypeScript compilation errors (`tsc --noEmit` in `frontend/instant-chat`)
  - Confirm no ESLint errors (`npm run lint` in `frontend/instant-chat`)
  - Confirm the server starts without errors
  - Ask the user if any questions arise before closing the spec
