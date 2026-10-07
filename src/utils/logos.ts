import "server-only";

import { mkdir, stat, writeFile } from "fs/promises";
import path from "path";

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
let activeDownloads = 0;
const waiters: Array<() => void> = [];

async function withDownloadSlot<T>(work: () => Promise<T>) {
  if (activeDownloads >= 3) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  activeDownloads += 1;
  try {
    return await work();
  } finally {
    activeDownloads -= 1;
    waiters.shift()?.();
  }
}

export async function cachedLogo(kind: "leagues" | "teams", id: number, remoteUrl: string | null) {
  if (!remoteUrl || !Number.isInteger(id) || id <= 0) return remoteUrl;
  const directory = path.join(process.cwd(), "public", "logos", kind);
  const file = path.join(directory, `${id}.png`);
  const href = `/logos/${kind}/${id}.png`;
  try {
    const info = await stat(file);
    if (Date.now() - info.mtimeMs < MAX_AGE_MS) return href;
  } catch {
    // The file is not on disk yet.
  }
  try {
    return await withDownloadSlot(async () => {
      const response = await fetch(remoteUrl);
      if (!response.ok) return remoteUrl;
      const bytes = Buffer.from(await response.arrayBuffer());
      await mkdir(directory, { recursive: true });
      await writeFile(file, bytes);
      return href;
    });
  } catch {
    return remoteUrl;
  }
}
