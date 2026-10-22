import { URL } from 'node:url';

export interface CrawledPageInfo {
  url: string;
  statusCode?: number;
  title?: string;
  statusText?: string;
  skippedReason?: string;
  durationMs?: number;
}

export interface BrokenLinkInfo {
  url: string;
  statusCode: number | string;
  error?: string;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetches and parses robots.txt for a given origin.
 * Extracts Disallow rules for User-agent: * or global.
 */
export async function fetchRobotsTxt(origin: string): Promise<string[]> {
  const robotsUrl = `${origin.replace(/\/$/, '')}/robots.txt`;
  const disallowRules: string[] = [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(robotsUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'PlainEnglishTestWriterAgent/1.0' },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return [];
    }

    const text = await res.text();
    const lines = text.split(/\r?\n/);
    let appliesToAll = false;

    for (let rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const lower = line.toLowerCase();
      if (lower.startsWith('user-agent:')) {
        const agent = line.slice(11).trim().toLowerCase();
        appliesToAll = (agent === '*' || agent.includes('plainenglishtestwriteragent'));
      } else if (appliesToAll && lower.startsWith('disallow:')) {
        const rule = line.slice(9).trim();
        if (rule) {
          disallowRules.push(rule);
        }
      }
    }
  } catch {
    // If robots.txt cannot be reached, default to empty rules
    return [];
  }

  return disallowRules;
}

/**
 * Checks whether a given path is disallowed by robots.txt rules.
 */
export function isPathDisallowedByRobots(pathname: string, disallowRules: string[]): boolean {
  for (const rule of disallowRules) {
    if (rule === '/') return true;
    if (rule.endsWith('$')) {
      const exactRule = rule.slice(0, -1);
      if (pathname === exactRule) return true;
    } else if (pathname.startsWith(rule)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks HTTP status of a link (broken link check).
 */
export async function checkLinkStatus(urlStr: string): Promise<{ url: string; statusCode: number | string; ok: boolean; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    let res: Response;
    try {
      res = await fetch(urlStr, {
        method: 'HEAD',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        redirect: 'follow',
      });
    } catch {
      // Retry with GET if HEAD is disallowed (some servers return 405 for HEAD)
      const getController = new AbortController();
      const getTimeout = setTimeout(() => getController.abort(), 5000);
      res = await fetch(urlStr, {
        method: 'GET',
        signal: getController.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        redirect: 'follow',
      });
      clearTimeout(getTimeout);
    }
    clearTimeout(timeout);

    const ok = res.status < 400;
    return {
      url: urlStr,
      statusCode: res.status,
      ok,
      error: ok ? undefined : `HTTP ${res.status} ${res.statusText}`,
    };
  } catch (err: any) {
    return {
      url: urlStr,
      statusCode: 'FAILED',
      ok: false,
      error: err?.message || 'Connection failed',
    };
  }
}
