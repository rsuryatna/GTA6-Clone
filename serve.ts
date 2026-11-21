// SOLMARINA dev server — serves the game over plain HTTP so a browser can
// load its ES modules (file:// blocks module imports). Node 22 stdlib only.
//   node serve.ts              -> http://127.0.0.1:8080
//   node serve.ts --port 8123  -> http://127.0.0.1:8123
//   PORT=9000 node serve.ts    -> http://127.0.0.1:9000
// The game itself lives under game/ and is served at the root, so
// http://127.0.0.1:8123/ opens the title screen and
// http://127.0.0.1:8123/?shot=hero stages the hero screenshot. The
// screenshots/ folder and shots.json are served too, under their own names,
// so a playtest can compare a live frame with the submitted pictures.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)));
const GAME_DIR = join(REPO_DIR, "game");
const SHOTS_DIR = join(REPO_DIR, "screenshots");
const SHOTS_INDEX = join(REPO_DIR, "shots.json");

function pickPort(): number {
  const argv = process.argv.slice(2);
  const flagAt = argv.indexOf("--port");
  let raw = process.env.PORT;
  if (flagAt !== -1 && argv[flagAt + 1]) raw = argv[flagAt + 1];
  if (flagAt !== -1 && argv[flagAt] && argv[flagAt].includes("=")) raw = argv[flagAt].split("=")[1];
  const parsed = Number.parseInt(raw ?? "8080", 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return 8080;
  return parsed;
}

const PORT = pickPort();

// Content types for everything the page can ask for. Anything else is
// served as a generic binary stream.
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".woff2": "font/woff2",
};

function contentType(file: string): string {
  return TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
}

// Turn a request path into a file on disk, or null when the path is not
// something this server hands out. The game folder is the root; the
// screenshots folder and shots.json keep their own names.
function fileFor(pathname: string): string | null {
  if (pathname === "/shots.json") return SHOTS_INDEX;
  if (pathname === "/screenshots" || pathname === "/screenshots/") return null;
  if (pathname.startsWith("/screenshots/")) {
    return resolve(join(SHOTS_DIR, normalize(pathname.slice("/screenshots/".length))));
  }
  const clean = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
  const file = resolve(join(GAME_DIR, normalize(clean)));
  if (file !== GAME_DIR && !file.startsWith(GAME_DIR + sep)) return null;
  return file;
}

// Keep a resolved file inside the folder it belongs to; anything that
// climbs out (../..) is refused instead of served.
function inside(file: string, folder: string): boolean {
  return file === folder || file.startsWith(folder + sep);
}

const server = createServer((request, response) => {
  const rawUrl = request.url ?? "/";
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(rawUrl, "http://127.0.0.1").pathname);
  } catch {
    response.writeHead(400, { "content-type": "text/plain" }).end("bad request\n");
    return;
  }

  const file = fileFor(pathname);
  const home = pathname.startsWith("/screenshots/") ? SHOTS_DIR : GAME_DIR;
  if (file === null || (file !== SHOTS_INDEX && !inside(file, home))) {
    response.writeHead(403, { "content-type": "text/plain" }).end("forbidden\n");
    return;
  }

  let size: number;
  try {
    const info = statSync(file);
    if (!info.isFile()) throw new Error("not a file");
    size = info.size;
  } catch {
    response.writeHead(404, { "content-type": "text/plain" }).end("not found\n");
    return;
  }

  const headers = {
    "content-type": contentType(file),
    "content-length": size,
    "cache-control": "no-store",
  };
  if (request.method === "HEAD") {
    response.writeHead(200, headers).end();
    return;
  }
  response.writeHead(200, headers);
  createReadStream(file).pipe(response);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`SOLMARINA is on http://127.0.0.1:${PORT}/  (game/ at the root)`);
});
