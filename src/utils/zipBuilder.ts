// Pure TypeScript PKZIP (STORE / CRC-32) Archive Builder for browser exports

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[i] = c >>> 0;
}

function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function sanitizeArchiveEntryPath(rawPath: string, fallbackIndex: number): string {
  const cleaned = (rawPath || '')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .split('/')
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .join('/')
    .trim();
  return cleaned || `file_${fallbackIndex + 1}.txt`;
}

function toDosTimeAndDate(date = new Date()): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

export interface ZipInputFile {
  path: string;
  content: string | Uint8Array;
}

export function buildZipArchiveBytes(inputFiles: ZipInputFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const { dosTime, dosDate } = toDosTimeAndDate();

  const usedPaths = new Set<string>();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;

  for (let i = 0; i < inputFiles.length; i++) {
    const rawEntry = inputFiles[i];
    let entryPath = sanitizeArchiveEntryPath(rawEntry.path, i);
    if (usedPaths.has(entryPath.toLowerCase())) {
      const dotIdx = entryPath.lastIndexOf('.');
      const base = dotIdx > 0 ? entryPath.slice(0, dotIdx) : entryPath;
      const ext = dotIdx > 0 ? entryPath.slice(dotIdx) : '';
      let suffix = 2;
      while (usedPaths.has(`${base}_${suffix}${ext}`.toLowerCase())) {
        suffix++;
      }
      entryPath = `${base}_${suffix}${ext}`;
    }
    usedPaths.add(entryPath.toLowerCase());

    const nameBytes = encoder.encode(entryPath);
    const dataBytes =
      typeof rawEntry.content === 'string' ? encoder.encode(rawEntry.content) : rawEntry.content;
    const crc = computeCrc32(dataBytes);
    const size = dataBytes.length;

    // Local File Header (30 bytes + filename + file bytes)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true); // Version needed to extract (2.0)
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // Compression method: 0 = STORE
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // Extra field length
    localHeader.set(nameBytes, 30);

    localChunks.push(localHeader, dataBytes);

    // Central Directory Header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central directory signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 flag
    cv.setUint16(10, 0, true); // Compression method: STORE
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // Extra length
    cv.setUint16(32, 0, true); // Comment length
    cv.setUint16(34, 0, true); // Disk number start
    cv.setUint16(36, 0, true); // Internal file attributes
    cv.setUint32(38, 0, true); // External file attributes
    cv.setUint32(42, localOffset, true); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralChunks.push(centralHeader);
    localOffset += localHeader.length + dataBytes.length;
  }

  const centralSize = centralChunks.reduce((sum, c) => sum + c.length, 0);

  // End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, centralChunks.length, true);
  ev.setUint16(10, centralChunks.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, localOffset, true);
  ev.setUint16(20, 0, true);

  const totalLength = localOffset + centralSize + eocd.length;
  const archive = new Uint8Array(totalLength);
  let cursor = 0;

  for (const chunk of localChunks) {
    archive.set(chunk, cursor);
    cursor += chunk.length;
  }
  for (const chunk of centralChunks) {
    archive.set(chunk, cursor);
    cursor += chunk.length;
  }
  archive.set(eocd, cursor);

  return archive;
}

export function downloadProjectAsZip(
  projectTitle: string,
  files: { name: string; folder?: string; content: string }[],
): void {
  const entries: ZipInputFile[] =
    files.length > 0
      ? files.map((f) => ({
          path: f.folder ? `${f.folder.replace(/^\/+|\/+$/g, '')}/${f.name}` : f.name,
          content: f.content || '',
        }))
      : [{ path: 'README.md', content: `# ${projectTitle}\n\nExported from MideoCode.\n` }];

  const zipBytes = buildZipArchiveBytes(entries);
  const safeBytes = new Uint8Array(zipBytes.length);
  safeBytes.set(zipBytes);
  const blob = new Blob([safeBytes.buffer], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug = (projectTitle || 'mideocode-project')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'mideocode-project';
  a.href = url;
  a.download = `${slug}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
