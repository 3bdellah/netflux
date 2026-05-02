export interface NetworkInfo {
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

export async function loadNetworkInfo(): Promise<NetworkInfo> {
  const cloudflareInfo = await loadCloudflareNetworkInfo();

  if (cloudflareInfo) {
    return cloudflareInfo;
  }

  const response = await fetch("/api/server-info", { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Unable to load network info.");
  }

  const data = (await response.json()) as Partial<NetworkInfo>;

  return {
    ip: getDisplayIp(data.ip),
    city: data.city || "Unknown",
    region: data.region,
    country: data.country,
    code: data.code || data.country || "NETFLUX",
  };
}

async function loadCloudflareNetworkInfo(): Promise<NetworkInfo | null> {
  try {
    const response = await fetch(`https://speed.cloudflare.com/meta?ts=${Date.now()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as CloudflareMetaResponse;
    const country = data.country || "Unknown";
    const city = data.city || data.region || "Unknown";

    return {
      ip: getDisplayIp(data.clientIp),
      city,
      region: data.region,
      country,
      code: data.colo || country,
    };
  } catch {
    return null;
  }
}

function getDisplayIp(ip: string | undefined) {
  if (!ip || isLocalIp(ip)) {
    return "Unavailable";
  }

  return ip;
}

function isLocalIp(ip: string) {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) ||
    ip.toLowerCase().startsWith("fe80:")
  );
}
