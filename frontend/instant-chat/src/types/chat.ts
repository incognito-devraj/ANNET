export type ChatUser = {
  id?: string;
  name: string;
};

export type FileMeta = {
  name: string;
  size: number;
  mimeType?: string;
};

export type Reaction = {
  emoji: string;
  count: number;
  // names of users who reacted (client-side only, current session)
  reactedByMe: boolean;
};

export type ReplyTo = {
  id: string;
  author: string;
  preview: string; // first 80 chars of the original message
};

export type ChatMessage =
  | {
      kind: "message";
      id: string;
      author: string;
      message: string;
      mine: boolean;
      ts: number;
      replyTo?: ReplyTo;
      reactions?: Record<string, Reaction>;
    }
  | {
      kind: "code";
      id: string;
      author: string;
      code: string;
      mine: boolean;
      ts: number;
      reactions?: Record<string, Reaction>;
    }
  | {
      kind: "system";
      id: string;
      message: string;
      ts: number;
    }
  | {
      kind: "file_offer";
      id: string;
      author: string;
      mine: boolean;
      fileMeta: FileMeta;
      offer: unknown;
      received: boolean;
      ts: number;
      // Transfer state (receiver side)
      transferState?: "idle" | "connecting" | "transferring" | "done" | "error";
      transferPercent?: number;
      transferError?: string;
      downloadBlob?: Blob;
      reactions?: Record<string, Reaction>;
    }
  | {
      kind: "image";
      id: string;
      author: string;
      mine: boolean;
      dataUrl: string;
      fileMeta: FileMeta;
      ts: number;
      reactions?: Record<string, Reaction>;
    };
