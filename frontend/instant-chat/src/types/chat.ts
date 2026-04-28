export type ChatUser = {
  id?: string;
  name: string;
};

export type FileMeta = {
  name: string;
  size: number;
};

export type ChatMessage =
  | {
      kind: "message";
      id: string;
      author: string;
      message: string;
      mine: boolean;
      ts: number;
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
    }
  | {
      kind: "image";
      id: string;
      author: string;
      mine: boolean;
      dataUrl: string;
      fileMeta: FileMeta;
      ts: number;
    };
