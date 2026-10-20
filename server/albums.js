const fs = require("node:fs");
const fsp = fs.promises;
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = process.env.ANNET_STORAGE_DIR || path.join(__dirname, "storage");
const MAX_IMAGE_BYTES = Number(process.env.ANNET_MAX_IMAGE_BYTES || 100 * 1024 * 1024);
const sessions = new Map();
const uploads = new Map();
const albumsByRoom = new Map();

function json(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; if (body.length > 1024 * 1024) reject(new Error("Request too large")); });
    req.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("Invalid JSON")); } });
    req.on("error", reject);
  });
}

function tokenFrom(req) { return (req.headers.authorization || "").replace(/^Bearer\s+/i, "") || String(req.query.token || ""); }
function auth(req, room) {
  const session = sessions.get(tokenFrom(req));
  if (!session || session.expiresAt < Date.now() || session.room !== room) return null;
  return session;
}
function safeName(name) { return path.basename(String(name || "image")).replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180) || "image"; }
function id() { return crypto.randomUUID(); }
function roomDir(room) { return path.join(ROOT, encodeURIComponent(room)); }
function sendError(res, status, message) { res.status(status).json({ ok: false, error: message }); }
function crc32Update(crc, buffer) { for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return crc; }
async function fileCrc(file) { return new Promise((resolve, reject) => { let crc = 0xffffffff; const stream = fs.createReadStream(file); stream.on("data", (chunk) => { crc = crc32Update(crc, chunk); }); stream.on("end", () => resolve((crc ^ 0xffffffff) >>> 0)); stream.on("error", reject); }); }
function u16(value) { const b = Buffer.alloc(2); b.writeUInt16LE(value); return b; }
function u32(value) { const b = Buffer.alloc(4); b.writeUInt32LE(value >>> 0); return b; }

function setupAlbumApi(app, io) {
  app.use((req, _res, next) => {
    if (req.path.startsWith("/api/albums")) req.setTimeout(30 * 60 * 1000);
    next();
  });

  app.post("/api/albums/session", async (req, res) => {
    try {
      const body = await json(req);
      if (!body.token || !body.room) return sendError(res, 400, "Missing album session details");
      const token = body.token;
      // The token is minted by Socket.IO and passed once over this authenticated session.
      sessions.set(token, { room: body.room, name: String(body.name || "member"), expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
      res.json({ ok: true, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
    } catch (error) { sendError(res, 400, error.message); }
  });

  app.get("/api/albums/:room", async (req, res) => {
    const session = auth(req, req.params.room);
    if (!session) return sendError(res, 403, "Room authorization required");
    res.json({ ok: true, albums: albumsByRoom.get(req.params.room) || [] });
  });

  app.post("/api/albums/:room/uploads", async (req, res) => {
    const session = auth(req, req.params.room);
    if (!session) return sendError(res, 403, "Room authorization required");
    try {
      const body = await json(req);
      const size = Number(body.size);
      if (!body.name || !String(body.mimeType || "").startsWith("image/") || !Number.isFinite(size) || size <= 0 || size > MAX_IMAGE_BYTES) {
        return sendError(res, 400, `Images must be under ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB`);
      }
      const uploadId = id();
      const key = path.join(roomDir(req.params.room), `${uploadId}-${safeName(body.name)}`);
      await fsp.mkdir(path.dirname(key), { recursive: true });
      uploads.set(uploadId, { room: req.params.room, name: safeName(body.name), mimeType: body.mimeType, size, key, received: 0, session });
      res.json({ ok: true, uploadId, uploadUrl: `/api/albums/${encodeURIComponent(req.params.room)}/uploads/${uploadId}` });
    } catch (error) { sendError(res, 400, error.message); }
  });

  app.put("/api/albums/:room/uploads/:uploadId", async (req, res) => {
    const session = auth(req, req.params.room);
    const upload = uploads.get(req.params.uploadId);
    if (!session || !upload || upload.room !== req.params.room || upload.session.name !== session.name) return sendError(res, 403, "Upload authorization required");
    if (req.headers["content-type"] !== upload.mimeType) return sendError(res, 415, "MIME type changed");
    const start = Number(req.headers["x-upload-offset"] || 0);
    if (start !== upload.received) return sendError(res, 409, "Invalid upload offset");
    await new Promise((resolve, reject) => {
      const stream = fs.createWriteStream(upload.key, { flags: start ? "a" : "w" });
      req.pipe(stream); stream.on("finish", resolve); stream.on("error", reject); req.on("error", reject);
    });
    upload.received = (await fsp.stat(upload.key)).size;
    if (upload.received > upload.size) return sendError(res, 413, "Upload exceeds declared size");
    res.json({ ok: true, offset: upload.received, complete: upload.received === upload.size });
  });

  app.post("/api/albums/:room", async (req, res) => {
    const session = auth(req, req.params.room);
    if (!session) return sendError(res, 403, "Room authorization required");
    try {
      const body = await json(req);
      if (!Array.isArray(body.attachments) || body.attachments.length < 1 || body.attachments.length > 50) return sendError(res, 400, "Invalid album");
      const attachments = body.attachments.map((item) => { const upload = uploads.get(item.uploadId); if (!upload || upload.room !== req.params.room || upload.received !== upload.size) throw new Error("An attachment is incomplete"); return { id: item.uploadId, name: upload.name, mimeType: upload.mimeType, size: upload.size, key: path.relative(ROOT, upload.key), uploadedAt: Date.now() }; });
      const album = { id: id(), room: req.params.room, author: session.name, caption: String(body.caption || "").slice(0, 2000), ts: Date.now(), attachments };
      const list = albumsByRoom.get(req.params.room) || [];
      list.push(album); albumsByRoom.set(req.params.room, list);
      await fsp.mkdir(roomDir(req.params.room), { recursive: true });
      await fsp.writeFile(path.join(roomDir(req.params.room), "albums.json"), JSON.stringify(list), "utf8");
      io.to(req.params.room).emit("album_created", album);
      res.json({ ok: true, album });
    } catch (error) { sendError(res, 400, error.message); }
  });

  app.get("/api/albums/:room/:albumId/:attachmentId", async (req, res) => {
    const session = auth(req, req.params.room); const albums = albumsByRoom.get(req.params.room) || [];
    const album = albums.find((entry) => entry.id === req.params.albumId); const attachment = album?.attachments.find((entry) => entry.id === req.params.attachmentId);
    if (!session || !attachment) return sendError(res, 404, "Image not found");
    res.setHeader("Content-Type", attachment.mimeType); res.setHeader("Content-Disposition", `${req.query.download === "1" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(attachment.name)}`); res.setHeader("Cache-Control", "private, max-age=300");
    fs.createReadStream(path.join(ROOT, attachment.key)).on("error", () => { if (!res.headersSent) sendError(res, 404, "Image unavailable"); }).pipe(res);
  });

  app.get("/api/albums/:room/:albumId.zip", async (req, res) => {
    const session = auth(req, req.params.room); const album = (albumsByRoom.get(req.params.room) || []).find((entry) => entry.id === req.params.albumId);
    if (!session || !album) return sendError(res, 404, "Album not found");
    try {
      const entries = []; const used = new Set();
      for (const attachment of album.attachments) {
        let name = attachment.name; let suffix = 2;
        while (used.has(name)) { const dot = attachment.name.lastIndexOf("."); name = `${attachment.name.slice(0, dot < 0 ? attachment.name.length : dot)} (${suffix++})${dot < 0 ? "" : attachment.name.slice(dot)}`; }
        used.add(name); const file = path.join(ROOT, attachment.key); const stat = await fsp.stat(file); entries.push({ name, file, size: stat.size, crc: await fileCrc(file) });
      }
      res.setHeader("Content-Type", "application/zip"); res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(`annet-album-${album.id}.zip`)}`);
      let offset = 0; const central = [];
      for (const entry of entries) {
        const name = Buffer.from(entry.name, "utf8"); const header = Buffer.concat([u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(entry.crc), u32(entry.size), u32(entry.size), u16(name.length), u16(0), name]);
        res.write(header); await new Promise((resolve, reject) => { const stream = fs.createReadStream(entry.file); stream.on("error", reject); stream.on("end", resolve); stream.pipe(res, { end: false }); });
        central.push({ name, crc: entry.crc, size: entry.size, offset }); offset += header.length + entry.size;
      }
      let centralSize = 0; const centralParts = central.map((entry) => { const part = Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(entry.crc), u32(entry.size), u32(entry.size), u16(entry.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(entry.offset), entry.name]); centralSize += part.length; return part; });
      res.write(Buffer.concat([...centralParts, u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralSize), u32(offset), u16(0)])); res.end();
    } catch (error) { if (!res.headersSent) sendError(res, 404, error.message); else res.destroy(error); }
  });

  // Load persisted metadata when the process starts. Object files remain untouched.
  void fsp.mkdir(ROOT, { recursive: true }).then(async () => {
    for (const room of await fsp.readdir(ROOT, { withFileTypes: true })) { if (!room.isDirectory()) continue; try { const list = JSON.parse(await fsp.readFile(path.join(ROOT, room.name, "albums.json"), "utf8")); albumsByRoom.set(decodeURIComponent(room.name), list); } catch {} }
  });
}

module.exports = { setupAlbumApi };
