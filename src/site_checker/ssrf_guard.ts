import * as dns from 'node:dns/promises';
import { URL } from 'node:url';

export interface UrlSafetyCheckResult {
  safe: boolean;
  error?: string;
  parsedUrl?: URL;
  resolvedIps?: string[];
}

/**
 * Checks if an IPv4 address is in a private, loopback, link-local, or reserved range.
 */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IPv4 is unsafe
  }

  const [b0, b1, b2, b3] = parts;

  // 0.0.0.0/8
  if (b0 === 0) return true;
  // 10.0.0.0/8 (Private)
  if (b0 === 10) return true;
  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;
  // 100.64.0.0/10 (CGNAT)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;
  // 169.254.0.0/16 (Link-local)
  if (b0 === 169 && b1 === 254) return true;
  // 172.16.0.0/12 (Private)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
  // 192.168.0.0/16 (Private)
  if (b0 === 192 && b1 === 168) return true;
  // 192.0.0.0/24, 192.0.2.0/24
  if (b0 === 192 && b1 === 0 && (b2 === 0 || b2 === 2)) return true;
  // 198.51.100.0/24
  if (b0 === 198 && b1 === 51 && b2 === 100) return true;
  // 203.0.113.0/24
  if (b0 === 203 && b1 === 0 && b2 === 113) return true;
  // 224.0.0.0/4 (Multicast) or 240.0.0.0/4 (Reserved)
  if (b0 >= 224) return true;

  return false;
}

/**
 * Checks if an IPv6 address is in a private, loopback, link-local, or reserved range.
 */
export function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // ::1 loopback
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;
  // :: unspecified
  if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true;

  // IPv4-mapped IPv6 (::ffff:192.168.1.1)
  if (normalized.includes('::ffff:')) {
    const ipv4Part = normalized.split('::ffff:')[1];
    if (ipv4Part && ipv4Part.includes('.')) {
      return isPrivateIPv4(ipv4Part);
    }
  }

  // fe80::/10 link-local
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true;
  }

  // fc00::/7 unique local (fc00:: - fdff::)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }

  // ff00::/8 multicast
  if (normalized.startsWith('ff')) {
    return true;
  }

  return false;
}

/**
 * Checks if an IP string is private (handles both v4 and v6).
 */
export function isPrivateIP(ip: string): boolean {
  if (ip.includes(':')) {
    return isPrivateIPv6(ip);
  }
  return isPrivateIPv4(ip);
}

/**
 * Returns whether a URL matches the configured demo app APP_BASE_URL.
 */
export function isAllowlistedDemoApp(parsedUrl: URL): boolean {
  const rawDemoUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
  try {
    const demoUrl = new URL(rawDemoUrl);
    // Same protocol, host (hostname + port)
    const hostMatches = parsedUrl.host.toLowerCase() === demoUrl.host.toLowerCase() ||
      (parsedUrl.hostname.toLowerCase() === '127.0.0.1' && demoUrl.hostname.toLowerCase() === 'localhost' && parsedUrl.port === (demoUrl.port || '80')) ||
      (parsedUrl.hostname.toLowerCase() === 'localhost' && demoUrl.hostname.toLowerCase() === '127.0.0.1' && parsedUrl.port === (demoUrl.port || '80'));
    
    return hostMatches;
  } catch {
    return false;
  }
}

/**
 * Validates a target URL against SSRF rules:
 * - Must be http: or https:
 * - Blocks localhost, private IP ranges, link-local, file://, etc.
 * - Allows the configured demo app (APP_BASE_URL)
 */
export async function validateUrlSafety(inputUrl: string): Promise<UrlSafetyCheckResult> {
  if (!inputUrl || typeof inputUrl !== 'string') {
    return { safe: false, error: 'URL must be a non-empty string.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(inputUrl.trim());
  } catch {
    return { safe: false, error: 'Invalid URL format. Please provide a valid http:// or https:// URL.' };
  }

  // Accept only http and https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      safe: false,
      error: `Blocked unsafe protocol '${parsed.protocol}'. Only http:// and https:// are accepted.`,
    };
  }

  // Check if allowlisted demo app
  if (isAllowlistedDemoApp(parsed)) {
    return { safe: true, parsedUrl: parsed, resolvedIps: ['127.0.0.1'] };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Explicit keyword checks for localhost / internal hostnames
  if (
    hostname === 'localhost' ||
    hostname === 'localhost.localdomain' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0'
  ) {
    return {
      safe: false,
      error: `SSRF Protection: Access to localhost or internal hostname '${hostname}' is blocked. (Configured demo app is allowlisted separately).`,
    };
  }

  // Resolve hostname via DNS
  let resolvedIps: string[] = [];
  try {
    const lookupResults = await dns.lookup(hostname, { all: true });
    resolvedIps = lookupResults.map(r => r.address);
  } catch (err: any) {
    return {
      safe: false,
      error: `DNS lookup failed for hostname '${hostname}': ${err?.message || 'Host could not be resolved'}.`,
    };
  }

  if (resolvedIps.length === 0) {
    return {
      safe: false,
      error: `Could not resolve any IP address for '${hostname}'.`,
    };
  }

  // Verify all resolved IPs
  for (const ip of resolvedIps) {
    if (isPrivateIP(ip)) {
      return {
        safe: false,
        error: `SSRF Protection: Hostname '${hostname}' resolved to private/internal IP address (${ip}). Automated checks on private networks are blocked.`,
        resolvedIps,
      };
    }
  }

  return {
    safe: true,
    parsedUrl: parsed,
    resolvedIps,
  };
}

/**
 * In-memory sliding window rate limiter
 */
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests = 10, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  checkLimit(key = 'global'): { allowed: boolean; retryAfterSec?: number } {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];
    const validTimestamps = timestamps.filter(t => now - t < this.windowMs);

    if (validTimestamps.length >= this.maxRequests) {
      const oldest = validTimestamps[0];
      const retryAfterSec = Math.ceil((this.windowMs - (now - oldest)) / 1000);
      return { allowed: false, retryAfterSec };
    }

    validTimestamps.push(now);
    this.requests.set(key, validTimestamps);
    return { allowed: true };
  }
}

export const siteCheckRateLimiter = new RateLimiter(10, 60000); // 10 requests per minute
