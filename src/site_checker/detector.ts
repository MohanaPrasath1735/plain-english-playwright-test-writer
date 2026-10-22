import { Page } from 'playwright';

export interface ChallengeDetectionResult {
  isChallenge: boolean;
  reason?: string;
}

/**
 * Detects if the current page is presenting a CAPTCHA, Cloudflare Turnstile,
 * OTP verification, or bot challenge blocking automated access.
 */
export async function detectBotChallengeOrCaptcha(page: Page, statusCode?: number): Promise<ChallengeDetectionResult> {
  // Check HTTP status code
  if (statusCode === 403 || statusCode === 429) {
    try {
      const pageText = await page.innerText('body').catch(() => '');
      if (
        pageText.includes('Cloudflare') ||
        pageText.includes('Attention Required') ||
        pageText.includes('Access Denied') ||
        pageText.includes('Verify you are human') ||
        pageText.includes('bot challenge') ||
        pageText.includes('security check')
      ) {
        return {
          isChallenge: true,
          reason: 'Blocked or manual step required: Automated access blocked by site protection (HTTP 403/429 Bot Challenge).',
        };
      }
    } catch {}
  }

  // Check DOM selectors for CAPTCHA/Challenge elements
  try {
    const hasChallengeElements = await page.evaluate(() => {
      // Common CAPTCHA and Turnstile selectors
      const selectors = [
        'iframe[src*="recaptcha"]',
        'iframe[src*="hcaptcha"]',
        'iframe[src*="challenges.cloudflare.com"]',
        'iframe[src*="arkoselabs"]',
        '.g-recaptcha',
        '.h-captcha',
        '#cf-turnstile',
        '.cf-turnstile',
        '[data-sitekey]',
        'form#challenge-form',
        '#challenge-stage',
      ];

      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return `Found challenge element matching '${sel}'`;
      }

      // Check title and body text
      const title = document.title || '';
      if (
        title.includes('Just a moment...') ||
        title.includes('Attention Required') ||
        title.includes('Security Check') ||
        title.includes('Cloudflare') ||
        title.includes('Human Verification')
      ) {
        return `Page title indicates bot barrier: "${title}"`;
      }

      const bodyText = (document.body && document.body.innerText) ? document.body.innerText.slice(0, 3000) : '';
      if (
        bodyText.includes('Verify you are human') ||
        bodyText.includes('Checking your browser before accessing') ||
        bodyText.includes('DDoS protection by Cloudflare') ||
        bodyText.includes('Please enter the OTP sent to') ||
        bodyText.includes('Enter the verification code')
      ) {
        return 'Page content contains CAPTCHA/OTP verification challenge text';
      }

      return null;
    });

    if (hasChallengeElements) {
      return {
        isChallenge: true,
        reason: `Blocked or manual step required: ${hasChallengeElements}. Automated testing halted without bypassing security barriers.`,
      };
    }
  } catch {
    // If evaluation fails (e.g. frame detached), return false
  }

  return { isChallenge: false };
}
