import { TestCaseInput, TestCaseInputSchema, UnderstoodFlow, FlowStep } from '../types.js';

/**
 * Step 1: Understand
 * Validates the raw JSON record, ensures stable ID,
 * and parses flow description and expected end state into structured steps.
 */
export function understandFlow(rawInput: unknown, baseUrl?: string): UnderstoodFlow {
  const effectiveBaseUrl = baseUrl || process.env.APP_BASE_URL;
  if (!effectiveBaseUrl) {
    throw new Error('APP_BASE_URL is not defined in environment or .env');
  }
  // Validate input schema with Zod
  const validated = TestCaseInputSchema.parse(rawInput);

  const steps: FlowStep[] = [];
  const rawDesc = validated.flow_description;

  // Rule-based flow parser identifying actions
  const sentenceDelimiters = /(?:\. |\n|;|, and |, then )+/;
  const rawParts = rawDesc.split(sentenceDelimiters).map(s => s.trim()).filter(Boolean);

  let stepCounter = 1;

  // Initial navigation
  let initialUrl = effectiveBaseUrl;
  if (/sign\s*up|register/i.test(rawDesc)) {
    initialUrl = `${effectiveBaseUrl.replace(/\/$/, '')}/register`;
  } else if (/login|sign\s*in/i.test(rawDesc)) {
    initialUrl = `${effectiveBaseUrl.replace(/\/$/, '')}/login`;
  }

  steps.push({
    stepNumber: stepCounter++,
    action: 'navigate',
    targetDescription: `Navigate to starting page ${initialUrl}`,
    value: initialUrl,
  });

  for (const part of rawParts) {
    const lower = part.toLowerCase();
    if (lower.includes('fill') || lower.includes('enter') || lower.includes('type') || lower.includes('input')) {
      if (lower.includes('username')) {
        steps.push({
          stepNumber: stepCounter++,
          action: 'fill',
          targetDescription: 'Username input field',
          value: '{{SYNTHETIC_USERNAME}}',
        });
      }
      if (lower.includes('email')) {
        steps.push({
          stepNumber: stepCounter++,
          action: 'fill',
          targetDescription: 'Email input field',
          value: '{{SYNTHETIC_EMAIL}}',
        });
      }
      if (lower.includes('password')) {
        steps.push({
          stepNumber: stepCounter++,
          action: 'fill',
          targetDescription: 'Password input field',
          value: '{{SYNTHETIC_PASSWORD}}',
        });
      }
    } else if (lower.includes('click') || lower.includes('submit') || lower.includes('press')) {
      if (lower.includes('sign up') || lower.includes('register') || lower.includes('submit')) {
        steps.push({
          stepNumber: stepCounter++,
          action: 'click',
          targetDescription: 'Sign up submission button',
        });
      } else {
        steps.push({
          stepNumber: stepCounter++,
          action: 'click',
          targetDescription: part,
        });
      }
    } else if (lower.includes('see') || lower.includes('assert') || lower.includes('verify') || lower.includes('dashboard')) {
      steps.push({
        stepNumber: stepCounter++,
        action: 'assert',
        targetDescription: `Assert ${part}`,
        value: validated.expected_end_state,
      });
    }
  }

  // Ensure an assertion step exists matching expected_end_state
  if (!steps.some(s => s.action === 'assert')) {
    steps.push({
      stepNumber: stepCounter++,
      action: 'assert',
      targetDescription: `Verify expected end state: ${validated.expected_end_state}`,
      value: validated.expected_end_state,
    });
  }

  return {
    testId: validated.id,
    rawFlow: validated.flow_description,
    steps,
    expectedEndState: validated.expected_end_state,
    targetInitialUrl: initialUrl,
  };
}
