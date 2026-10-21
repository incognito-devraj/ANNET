export type ChatUser = {
  id?: string;
  name: string;
};

export type FileMeta = {
  name: string;
  size: number;
  mimeType?: string;
};

export type AlbumAttachment = FileMeta & { id: string; url: string };
export type Album = { id: string; author: string; caption?: string; ts: number; zipUrl?: string; attachments: AlbumAttachment[] };

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
    }
  | {
      kind: "code";
      id: string;
      author: string;
      code: string;
      mine: boolean;
      ts: number;
      replyTo?: ReplyTo;
    }
  | {
      kind: "system";
      id: string;
      message: string;
      ts: number;
      action?: { label: string; onClick: () => void };
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
    }
  | {
      kind: "media";
      id: string;
      author: string;
      mine: boolean;
      dataUrl: string;
      fileMeta: FileMeta;
      ts: number;
      replyTo?: ReplyTo;
    }
  | {
      kind: "album";
      id: string;
      author: string;
      mine: boolean;
      album: Album;
      ts: number;
      replyTo?: ReplyTo;
    };
