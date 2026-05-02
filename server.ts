import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import helmet from "helmet";
import compression from "compression";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeIpAddress(ip: string | undefined): string {
  if (!ip) return "unknown";
  if (ip === "::1") return "127.0.0.1";
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
}

function getDisplayIpAddress(ip: string): string {
  if (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) ||
    ip.toLowerCase().startsWith("fe80:")
  ) {
    return "Unavailable";
  }

  return ip;
}

interface PublicNetworkInfo {
  ip: string;
  city: string;
  region?: string;
  country?: string;
  code: string;
}

interface CloudflareMetaResponse {
  clientIp?: string;
  city?: string;
  region?: string;
  country?: string;
  colo?: string;
}

let publicNetworkInfoCache: {
  expiresAt: number;
  value: PublicNetworkInfo;
} | null = null;

function getRequestIp(req: express.Request): string {
  const forwardedFor = req.header("x-forwarded-for")?.split(",")[0]?.trim();
  const cloudflareIp = req.header("cf-connecting-ip");

  return normalizeIpAddress(cloudflareIp || forwardedFor || req.socket.remoteAddress);
}

async function fetchPublicNetworkInfo(fallbackIp: string): Promise<PublicNetworkInfo> {
  const now = Date.now();

  if (publicNetworkInfoCache && publicNetworkInfoCache.expiresAt > now) {
    return publicNetworkInfoCache.value;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch("https://speed.cloudflare.com/meta", {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Cloudflare meta failed with ${response.status}`);
    }

    const data = (await response.json()) as CloudflareMetaResponse;
    const country = data.country || "Unknown";
    const city = data.city || data.region || "Unknown";
    const value: PublicNetworkInfo = {
      ip: data.clientIp || fallbackIp,
      city,
      region: data.region,
      country,
      code: data.colo || country,
    };

    publicNetworkInfoCache = {
      expiresAt: now + 60_000,
      value,
    };

    return value;
  } catch {
    return {
      ip: getDisplayIpAddress(fallbackIp),
      city: process.env.SERVER_CITY || "Unknown",
      country: process.env.SERVER_COUNTRY || undefined,
      code: process.env.SERVER_CODE || "NETFLUX",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Security and performance middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for demo/vite compatibility
    crossOriginEmbedderPolicy: false,
  }));
  app.use(compression());
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    next();
  });

  // API Routes
  
  // Ping endpoint
  app.get("/api/ping", (req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  // Create a reusable buffer of random data to avoid generating it on every request
  const randomBuffer = crypto.randomBytes(1024 * 1024); // 1MB buffer

  // Download endpoint - streams random data
  app.get("/api/download", (req, res) => {
    const sizeMB = parseInt(req.query.size as string) || 50;
    const totalBytes = sizeMB * 1024 * 1024;
    
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", totalBytes);
    res.setHeader("X-Content-Type-Options", "nosniff");

    let sentBytes = 0;
    const chunkSize = 128 * 1024; // 128KB chunks

    const sendChunk = () => {
      const remainingBytes = totalBytes - sentBytes;
      const currentChunk = Math.min(chunkSize, remainingBytes);
      
      if (currentChunk <= 0) {
        res.end();
        return;
      }

      // Use slice to get parts of the pre-allocated buffer
      const bufferSlice = randomBuffer.subarray(0, currentChunk);
      
      const canContinue = res.write(bufferSlice);
      sentBytes += currentChunk;

      if (!canContinue) {
        res.once('drain', sendChunk);
      } else {
        // Use setImmediate to keep event loop free but push data as fast as possible
        setImmediate(sendChunk);
      }
    };

    sendChunk();
  });

  // Upload endpoint - consumes incoming stream
  app.post("/api/upload", (req, res) => {
    let receivedBytes = 0;
    
    req.on("data", (chunk) => {
      receivedBytes += chunk.length;
    });

    req.on("end", () => {
      res.json({ receivedBytes, status: "success" });
    });
  });

  // Server info endpoint - exposes public client network metadata when available.
  app.get("/api/server-info", async (req, res) => {
    const fallbackIp = getRequestIp(req);
    const info = await fetchPublicNetworkInfo(fallbackIp);

    res.json(info);
  });

  // SEO Files
  app.get("/robots.txt", (req, res) => {
    res.type("text/plain");
    res.send(`User-agent: *
Allow: /
Sitemap: ${process.env.APP_URL || "http://localhost:3000"}/sitemap.xml`);
  });

  app.get("/sitemap.xml", (req, res) => {
    const baseUrl = process.env.APP_URL || "http://localhost:3000";
    const pages = ["", "/speed-test", "/home", "/about", "/contact", "/privacy-policy", "/terms"];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${pages.map(p => `
  <url>
    <loc>${baseUrl}${p}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${p === "" ? "1.0" : "0.8"}</priority>
  </url>`).join("")}
</urlset>`;
    res.type("application/xml");
    res.send(xml);
  });

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
