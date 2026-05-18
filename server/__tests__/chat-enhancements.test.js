/**
 * Bug Condition Exploration Tests — Task 1
 * Preservation Tests — Task 2
 *
 * Task 1 tests encode the EXPECTED (fixed) behavior and are intentionally
 * written to FAIL on the current unfixed code. Failure confirms the bugs
 * exist. They will pass once the fixes are implemented.
 *
 * Task 2 tests capture BASELINE behavior that must not regress after fixes.
 * These tests PASS on unfixed code.
 *
 * DO NOT attempt to fix the tests or the implementation when they fail.
 */

const fc = require("fast-check");
const { addUser, removeUser, getUsersInRoom } = require("../utils/users");

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Reset the in-memory users store between tests.
 * We do this by removing any users we added during the test.
 */
function cleanupUsers(...ids) {
  ids.forEach((id) => removeUser(id));
}

// ─── Test 1d — Duplicate nickname: addUser accepts duplicate ─────────────────
//
// Bug Condition: isBugCondition_DuplicateNick(X) where
//   EXISTS u IN users WHERE u.room = X.room AND u.name = X.name
//
// EXPECTED OUTCOME ON UNFIXED CODE: FAILS
//   addUser returns a user object instead of an error for the duplicate.
//   Counterexample: addUser("id2", "Alice", "general") returns
//   { id: "id2", name: "Alice", room: "general" } instead of
//   { error: "Nickname already taken in this room." }
//
// Validates: Requirements 2.7

describe("Test 1d — Duplicate nickname: addUser accepts duplicate", () => {
  afterEach(() => {
    cleanupUsers("id1", "id2");
  });

  it("should return an error when the same nickname is used in the same room", () => {
    // First join — should succeed
    const first = addUser("id1", "Alice", "general");
    expect(first).toEqual({ id: "id1", name: "Alice", room: "general" });

    // Second join with same name in same room — should be rejected
    const second = addUser("id2", "Alice", "general");

    // EXPECTED BEHAVIOR (fixed code): returns error
    // ACTUAL BEHAVIOR (unfixed code): returns { id: "id2", name: "Alice", room: "general" }
    // → THIS TEST FAILS ON UNFIXED CODE (confirms bug exists)
    expect(second).toEqual({ error: "Nickname already taken in this room." });
  });

  it("should not mutate the store when a duplicate is rejected", () => {
    addUser("id1", "Alice", "general");
    addUser("id2", "Alice", "general");

    // After the duplicate attempt, only one "Alice" should be in the store.
    // On unfixed code, two "Alice" entries exist — this assertion fails.
    const { getUsersInRoom } = require("../utils/users");
    const usersInRoom = getUsersInRoom("general");
    const aliceCount = usersInRoom.filter((u) => u.name === "Alice").length;

    // EXPECTED BEHAVIOR (fixed code): only 1 Alice
    // ACTUAL BEHAVIOR (unfixed code): 2 Alices
    // → THIS TEST FAILS ON UNFIXED CODE (confirms bug exists)
    expect(aliceCount).toBe(1);
  });
});

// ─── Test 1e — Duplicate nickname: error message string validation ────────────
//
// Note: Testing the full Chat.tsx pre-join inline error flow requires a
// complex socket mock setup. Instead, this test validates the error message
// string that flows from the server to the frontend. The frontend's onError
// handler is expected to call setNameError(text) when joined === false.
//
// Expected frontend behavior (currently broken):
//   - When joined === false and an "error" socket event arrives with
//     "Nickname already taken in this room.", the Chat.tsx component should
//     call setNameError("Nickname already taken in this room.") so the error
//     appears inline on the nickname entry screen.
//   - Currently, the onError handler only fires toast.error(text) and does
//     NOT call setNameError, so nameError stays null pre-join.
//
// This test validates the error message string that would flow to the frontend.
// Validates: Requirements 2.7, 2.9

describe("Test 1e — Duplicate nickname: error message string matches expected", () => {
  afterEach(() => {
    cleanupUsers("id1", "id2");
  });

  it("should return the exact error message string expected by the frontend", () => {
    addUser("id1", "Alice", "general");
    const result = addUser("id2", "Alice", "general");

    // The frontend's onError handler checks for this exact string to set nameError.
    // EXPECTED BEHAVIOR (fixed code): result.error === "Nickname already taken in this room."
    // ACTUAL BEHAVIOR (unfixed code): result.error is undefined (result is a user object)
    // → THIS TEST FAILS ON UNFIXED CODE (confirms bug exists)
    expect(result.error).toBe("Nickname already taken in this room.");
  });
});

// ─── Test 2c — Non-duplicate join succeeds (property-based) ─────────────────
//
// Preservation: For any valid (id, name, room) triple where no duplicate
// exists in the store, addUser must return a user object matching the input.
// This test PASSES on unfixed code.
//
// Validates: Requirements 3.5, 3.6, 3.7

describe("Test 2c — Non-duplicate join succeeds (property-based)", () => {
  it("should return a user object for any valid unique (id, name, room) triple", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),                    // socket id
        fc.stringMatching(/^[a-zA-Z0-9_]{1,24}$/),     // valid nickname
        fc.string({ minLength: 1 }),                    // room name
        (id, name, room) => {
          // Ensure the store is clean for this name+room combination
          // by using a unique id prefix to avoid cross-run collisions
          const uniqueId = `test-2c-${id}`;

          const result = addUser(uniqueId, name, room);

          // Clean up immediately
          removeUser(uniqueId);

          // Must return a user object, not an error
          expect(result).toEqual({ id: uniqueId, name, room });
        }
      )
    );
  });
});

// ─── Test 2d — Cross-room same-name join succeeds ────────────────────────────
//
// Preservation: The same nickname in a different room must be accepted.
// This test PASSES on unfixed code.
//
// Validates: Requirements 3.6

describe("Test 2d — Cross-room same-name join succeeds", () => {
  afterEach(() => {
    cleanupUsers("id1", "id2");
  });

  it("should allow the same nickname in two different rooms", () => {
    const first = addUser("id1", "Alice", "general");
    expect(first).toEqual({ id: "id1", name: "Alice", room: "general" });

    // Same name, different room — must succeed
    const second = addUser("id2", "Alice", "lobby");
    expect(second).toEqual({ id: "id2", name: "Alice", room: "lobby" });
  });
});

// ─── Test 2e — Existing addUser validation errors are unchanged ───────────────
//
// Preservation: Length and character-pattern validation errors must remain
// exactly as they are after the duplicate-nickname fix is applied.
// These tests PASS on unfixed code.
//
// Validates: Requirements 3.7

describe("Test 2e — Existing addUser validation errors are unchanged", () => {
  it("should return an error when the nickname exceeds 24 characters", () => {
    const longName = "A".repeat(25); // 25 chars — one over the limit
    const result = addUser("id-long", longName, "general");
    expect(result).toEqual({ error: "Nickname must be 24 characters or fewer." });
  });

  it("should return an error when the nickname contains invalid characters", () => {
    const invalidName = "Alice!"; // contains '!'
    const result = addUser("id-invalid", invalidName, "general");
    expect(result).toEqual({
      error: "Nickname may only contain letters, numbers, and underscores.",
    });
  });
});
