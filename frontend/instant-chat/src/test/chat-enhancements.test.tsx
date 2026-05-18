/**
 * Bug Condition Exploration Tests — Task 1
 *
 * These tests encode the EXPECTED (fixed) behavior and are intentionally
 * written to FAIL on the current unfixed code. Failure confirms the bugs
 * exist. They will pass once the fixes are implemented.
 *
 * DO NOT attempt to fix the tests or the implementation when they fail.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import InputBar from "@/components/chat/InputBar";
import MessageBubble from "@/components/chat/MessageBubble";
import type { ChatMessage } from "@/types/chat";

// ─── Test 1a — Typing: no `typing` event emitted ────────────────────────────
//
// Bug Condition: isBugCondition_Typing(X) where
//   X.action = "keystroke_in_input_bar" AND onTyping was NOT called
//
// EXPECTED OUTCOME ON UNFIXED CODE: FAILS
//   InputBar does not have an onTyping prop, so the mock is never called.
//   Counterexample: onTyping is never invoked after a change event.
//
// Validates: Requirements 1.1, 2.1

describe("Test 1a — Typing: onTyping called on keystroke", () => {
  it("should call onTyping when the textarea value changes to a non-empty string", () => {
    const onSend = vi.fn();
    const onFile = vi.fn();
    const onTyping = vi.fn();
    const onStopTyping = vi.fn();

    // EXPECTED BEHAVIOR (fixed code): InputBar accepts onTyping and onStopTyping props
    // ACTUAL BEHAVIOR (unfixed code): InputBar has no onTyping prop — TypeScript would
    //   reject this, but at runtime the prop is simply ignored and never called.
    // → THIS TEST FAILS ON UNFIXED CODE (confirms bug exists)
    render(
      <InputBar
        onSend={onSend}
        onFile={onFile}
        // @ts-expect-error — onTyping does not exist on unfixed InputBar props
        onTyping={onTyping}
        // @ts-expect-error — onStopTyping does not exist on unfixed InputBar props
        onStopTyping={onStopTyping}
      />
    );

    const textarea = screen.getByPlaceholderText("Message…");

    // Simulate typing a character
    fireEvent.change(textarea, { target: { value: "h" } });

    // EXPECTED BEHAVIOR (fixed code): onTyping is called once
    // ACTUAL BEHAVIOR (unfixed code): onTyping is never called
    // → THIS ASSERTION FAILS ON UNFIXED CODE
    expect(onTyping).toHaveBeenCalledTimes(1);
  });
});

// ─── Test 1b — Typing: no `stop_typing` event after inactivity ──────────────
//
// Bug Condition: isBugCondition_Typing(X) where
//   X.action = "keystroke_in_input_bar" AND onStopTyping was NOT called after 1500ms
//
// EXPECTED OUTCOME ON UNFIXED CODE: FAILS
//   InputBar has no debounce timer and no onStopTyping prop.
//   Counterexample: onStopTyping is never invoked even after 1500ms of inactivity.
//
// Validates: Requirements 1.2, 2.2

describe("Test 1b — Typing: onStopTyping called after 1500ms inactivity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should call onStopTyping after ~1500ms of inactivity following a keystroke", async () => {
    const onSend = vi.fn();
    const onFile = vi.fn();
    const onTyping = vi.fn();
    const onStopTyping = vi.fn();

    render(
      <InputBar
        onSend={onSend}
        onFile={onFile}
        // @ts-expect-error — onTyping does not exist on unfixed InputBar props
        onTyping={onTyping}
        // @ts-expect-error — onStopTyping does not exist on unfixed InputBar props
        onStopTyping={onStopTyping}
      />
    );

    const textarea = screen.getByPlaceholderText("Message…");

    // Simulate typing
    fireEvent.change(textarea, { target: { value: "hello" } });

    // onStopTyping should NOT be called immediately
    expect(onStopTyping).not.toHaveBeenCalled();

    // Advance timers by 1500ms (the debounce window)
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    // EXPECTED BEHAVIOR (fixed code): onStopTyping is called after 1500ms
    // ACTUAL BEHAVIOR (unfixed code): onStopTyping is never called (no debounce exists)
    // → THIS ASSERTION FAILS ON UNFIXED CODE
    expect(onStopTyping).toHaveBeenCalledTimes(1);
  });
});

// ─── Test 2a — Message send is unaffected by typing changes ─────────────────
//
// Preservation: InputBar's send path must work correctly regardless of any
// typing-indicator changes. This test PASSES on unfixed code.
//
// Validates: Requirements 3.1, 3.2

describe("Test 2a — Message send is unaffected by typing changes", () => {
  it("should call onSend with the correct text when Enter is pressed", () => {
    const onSend = vi.fn();
    const onFile = vi.fn();

    render(<InputBar onSend={onSend} onFile={onFile} />);

    const textarea = screen.getByPlaceholderText("Message…");

    // Type a message
    fireEvent.change(textarea, { target: { value: "Hello world" } });

    // Press Enter to send
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    // onSend must be called with the trimmed text
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("Hello world");
  });
});

// ─── Test 2b — Reply button still present after reaction removal ─────────────
//
// Preservation: The reply button (aria-label "Reply") must remain on hover
// after the reaction UI is removed. This test PASSES on unfixed code.
//
// Validates: Requirements 3.3, 3.4

describe("Test 2b — Reply button still present after reaction removal", () => {
  it("should render the reply button when hovering over a kind:message bubble", () => {
    const msg: ChatMessage = {
      kind: "message",
      id: "msg-2",
      author: "Bob",
      message: "Hey there",
      mine: false,
      ts: Date.now(),
    };

    const onReply = vi.fn();

    render(
      <MessageBubble
        msg={msg}
        onReply={onReply}
      />
    );

    // Hover over the message bubble to reveal action buttons
    const bubble = screen.getByText("Hey there").closest("div[class*='flex flex-col']");
    if (bubble) {
      fireEvent.mouseEnter(bubble);
    }

    // The reply button must be present in the DOM
    const replyButton = screen.getByLabelText("Reply");
    expect(replyButton).toBeInTheDocument();
  });
});

// ─── Test 1c — Reactions: EmojiPicker / ReactionBar rendered ────────────────
//
// Bug Condition: isBugCondition_Reactions(X) where
//   X.kind = "message" AND renders(reaction_button) = TRUE
//
// EXPECTED OUTCOME ON UNFIXED CODE: FAILS
//   MessageBubble renders a 😊 button with aria-label "React" on unfixed code.
//   Counterexample: getByLabelText("React") finds the button in the DOM.
//
// Validates: Requirements 1.3, 1.4, 2.4, 2.5

describe("Test 1c — Reactions: no reaction UI rendered on MessageBubble", () => {
  it("should NOT render a React button (😊) on a kind:message bubble", () => {
    const msg: ChatMessage = {
      kind: "message",
      id: "msg-1",
      author: "Alice",
      message: "Hello world",
      mine: false,
      ts: Date.now(),
    };

    const onReply = vi.fn();

    render(
      <MessageBubble
        msg={msg}
        onReply={onReply}
      />
    );

    // EXPECTED BEHAVIOR (fixed code): no element with aria-label "React" exists
    // ACTUAL BEHAVIOR (unfixed code): a 😊 button with aria-label "React" IS present
    // → THIS ASSERTION FAILS ON UNFIXED CODE
    const reactButton = screen.queryByLabelText("React");
    expect(reactButton).toBeNull();
  });
});
