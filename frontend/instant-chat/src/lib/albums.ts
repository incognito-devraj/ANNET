import { getBackendUrl } from "./socket";
import type { Album } from "@/types/chat";

const base = getBackendUrl().replace(/\/$/, "");
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function registerAlbumSession(room: string, name: string, token: string) {
  const response = await fetch(`${base}/api/albums/session`, { method: "POST", headers: { ...auth(token), "Content-Type": "application/json" }, body: JSON.stringify({ room, name, token }) });
  if (!response.ok) throw new Error("Album storage session could not be opened");
}

export async function listAlbums(room: string, token: string): Promise<Album[]> {
  const response = await fetch(`${base}/api/albums/${encodeURIComponent(room)}`, { headers: auth(token), cache: "no-store" });
  if (!response.ok) throw new Error("Album history unavailable");
  return (await response.json()).albums || [];
}

export async function uploadAlbum(room: string, token: string, files: File[], caption: string, onProgress: (value: number) => void, signal?: AbortSignal) {
  const uploaded: { uploadId: string }[] = [];
  let complete = 0;
  const concurrency = Math.min(3, files.length);
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const index = next++; const file = files[index];
      const init = await fetch(`${base}/api/albums/${encodeURIComponent(room)}/uploads`, { method: "POST", headers: { ...auth(token), "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, size: file.size, mimeType: file.type }), signal });
      if (!init.ok) throw new Error((await init.json()).error || "Upload could not start");
      const { uploadId, uploadUrl } = await init.json();
      const response = await fetch(`${base}${uploadUrl}`, { method: "PUT", headers: { ...auth(token), "Content-Type": file.type, "X-Upload-Offset": "0" }, body: file, signal });
      if (!response.ok) throw new Error((await response.json()).error || `Upload failed for ${file.name}`);
      uploaded[index] = { uploadId }; complete += 1; onProgress(Math.round((complete / files.length) * 100));
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  const response = await fetch(`${base}/api/albums/${encodeURIComponent(room)}`, { method: "POST", headers: { ...auth(token), "Content-Type": "application/json" }, body: JSON.stringify({ caption, attachments: uploaded }), signal });
  if (!response.ok) throw new Error((await response.json()).error || "Album could not be created");
  return (await response.json()).album as Album;
}

export function albumImageUrl(room: string, token: string, albumId: string, attachmentId: string) {
  return `${base}/api/albums/${encodeURIComponent(room)}/${albumId}/${attachmentId}?token=${encodeURIComponent(token)}`;
}

export function albumImageDownloadUrl(url: string) {
  return `${url}&download=1`;
}

export function albumZipUrl(room: string, token: string, albumId: string) {
  return `${base}/api/albums/${encodeURIComponent(room)}/${albumId}.zip?token=${encodeURIComponent(token)}`;
}
