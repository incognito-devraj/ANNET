const encoder = new TextEncoder();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(timestamp: number) {
  const date = new Date(timestamp);
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { dosDate, dosTime };
}

function writeUint16(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

type ZipEntry = {
  fileNameBytes: Uint8Array;
  content: Uint8Array;
  crc: number;
  offset: number;
  dosDate: number;
  dosTime: number;
};

function normalizeRelativePath(file: File, folderName: string) {
  const rawPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
  const normalized = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized.startsWith(`${folderName}/`) ? normalized : `${folderName}/${normalized}`;
}

export async function createZipFromFiles(files: File[]) {
  if (files.length === 0) {
    throw new Error("No folder files selected.");
  }

  const firstPath = ((files[0] as File & { webkitRelativePath?: string }).webkitRelativePath || files[0].name).replace(/\\/g, "/");
  const folderName = firstPath.split("/")[0] || "folder";

  const entries: ZipEntry[] = [];
  const localParts: BlobPart[] = [];
  let offset = 0;

  for (const file of files) {
    const content = new Uint8Array(await file.arrayBuffer());
    const fileNameBytes = encoder.encode(normalizeRelativePath(file, folderName));
    const crc = crc32(content);
    const { dosDate, dosTime } = getDosDateTime(file.lastModified || Date.now());

    const header = new Uint8Array(30 + fileNameBytes.length);
    writeUint32(header, 0, 0x04034b50);
    writeUint16(header, 4, 20);
    writeUint16(header, 6, 0x0800);
    writeUint16(header, 8, 0);
    writeUint16(header, 10, dosTime);
    writeUint16(header, 12, dosDate);
    writeUint32(header, 14, crc);
    writeUint32(header, 18, content.byteLength);
    writeUint32(header, 22, content.byteLength);
    writeUint16(header, 26, fileNameBytes.length);
    writeUint16(header, 28, 0);
    header.set(fileNameBytes, 30);

    localParts.push(header, content);
    entries.push({ fileNameBytes, content, crc, offset, dosDate, dosTime });
    offset += header.byteLength + content.byteLength;
  }

  const centralParts: BlobPart[] = [];
  let centralSize = 0;

  for (const entry of entries) {
    const central = new Uint8Array(46 + entry.fileNameBytes.length);
    writeUint32(central, 0, 0x02014b50);
    writeUint16(central, 4, 20);
    writeUint16(central, 6, 20);
    writeUint16(central, 8, 0x0800);
    writeUint16(central, 10, 0);
    writeUint16(central, 12, entry.dosTime);
    writeUint16(central, 14, entry.dosDate);
    writeUint32(central, 16, entry.crc);
    writeUint32(central, 20, entry.content.byteLength);
    writeUint32(central, 24, entry.content.byteLength);
    writeUint16(central, 28, entry.fileNameBytes.length);
    writeUint16(central, 30, 0);
    writeUint16(central, 32, 0);
    writeUint16(central, 34, 0);
    writeUint16(central, 36, 0);
    writeUint32(central, 38, 0);
    writeUint32(central, 42, entry.offset);
    central.set(entry.fileNameBytes, 46);

    centralParts.push(central);
    centralSize += central.byteLength;
  }

  const endRecord = new Uint8Array(22);
  writeUint32(endRecord, 0, 0x06054b50);
  writeUint16(endRecord, 4, 0);
  writeUint16(endRecord, 6, 0);
  writeUint16(endRecord, 8, entries.length);
  writeUint16(endRecord, 10, entries.length);
  writeUint32(endRecord, 12, centralSize);
  writeUint32(endRecord, 16, offset);
  writeUint16(endRecord, 20, 0);

  return new File([...localParts, ...centralParts, endRecord], `${folderName}.zip`, {
    type: "application/zip",
    lastModified: Date.now(),
  });
}
