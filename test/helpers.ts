import http from "node:http";
import net, { type AddressInfo } from "node:net";
import type { Server } from "../src/types.js";

export interface MockServer {
  base: string;
  port: number;
  hits: { method: string; url: string }[];
  close: () => Promise<void>;
}

/** Local HTTP server with one route per failure mode the probe must handle. */
export async function startMockServer(): Promise<MockServer> {
  const hits: { method: string; url: string }[] = [];
  const sockets = new Set<net.Socket>();
  const srv = http.createServer((req, res) => {
    const method = req.method ?? "GET";
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    hits.push({ method, url });
    switch (url) {
      case "/ok":
        res.writeHead(200, { "content-type": "text/html" }).end("<a href='movie.mkv'>m</a>");
        return;
      case "/head405":
        if (method === "HEAD") res.writeHead(405).end();
        else res.writeHead(206, { "content-range": "bytes 0-0/10" }).end("x");
        return;
      case "/redirect":
        res.writeHead(302, { location: "/ok" }).end();
        return;
      case "/loop":
        res.writeHead(302, { location: "/loop" }).end();
        return;
      case "/forbidden":
        res.writeHead(403).end();
        return;
      case "/broken":
        res.writeHead(500).end();
        return;
      case "/drop-head":
        if (method === "HEAD") req.socket.destroy();
        else res.writeHead(200).end("ok");
        return;
      case "/hang":
        return; // never answer
      case "/big":
        // rejects HEAD; GET ignores Range and streams forever-ish
        if (method === "HEAD") {
          res.writeHead(405).end();
          return;
        }
        res.writeHead(200, { "content-type": "video/x-matroska" });
        res.write(Buffer.alloc(64 * 1024));
        return;
      default:
        res.writeHead(404).end();
    }
  });
  srv.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const { port } = srv.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    port,
    hits,
    close: () =>
      new Promise<void>((r) => {
        for (const s of sockets) s.destroy();
        srv.close(() => r());
      }),
  };
}

/** A port with nothing listening (ECONNREFUSED). */
export async function closedPort(): Promise<number> {
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const { port } = s.address() as AddressInfo;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

export function srv(url: string, extra: Partial<Server> = {}): Server {
  return { url, name: url, provider: "Test", type: "ftp", ...extra };
}
