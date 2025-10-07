/**
 * Guardrails Module - PII Detection and Sanitization
 */

// Types
export interface DetectionResult {
  found: boolean;
  matches: string[];
  positions: { start: number; end: number }[];
}

export interface Plugin {
  name: string;
  detect: (text: string) => DetectionResult;
  replacement?: string;
}

export interface SanitizationResult {
  sanitizedText: string;
  triggeredPlugins: string[];
  detections: Record<string, string[]>;
}

// Plugin Implementations

/**
 * Credit Card Number Detection
 * Detects major card formats (Visa, Mastercard, Amex, Discover)
 */
export const creditCardPlugin: Plugin = {
  name: 'Credit Card',
  detect: (text: string): DetectionResult => {
    // Pattern for credit cards with optional spaces/dashes
    const pattern = /\b(?:\d{4}[\s\-]?){3}\d{4}\b|\b\d{4}[\s\-]?\d{6}[\s\-]?\d{5}\b/g;
    const matches: string[] = [];
    const positions: { start: number; end: number }[] = [];
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const cardNumber = match[0].replace(/[\s\-]/g, '');
      // Basic Luhn algorithm check
      if (isValidLuhn(cardNumber)) {
        matches.push(match[0]);
        positions.push({ start: match.index, end: match.index + match[0].length });
      }
    }

    return {
      found: matches.length > 0,
      matches,
      positions,
    };
  },
  replacement: '[CREDIT_CARD]',
};

/**
 * IP Address Detection (IPv4 and IPv6)
 */
export const ipAddressPlugin: Plugin = {
  name: 'IP Address',
  detect: (text: string): DetectionResult => {
    // IPv4 pattern
    const ipv4Pattern = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
    // IPv6 pattern (simplified)
    const ipv6Pattern = /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:){1,7}:\b|\b::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}\b/g;

    const matches: string[] = [];
    const positions: { start: number; end: number }[] = [];

    let match;
    while ((match = ipv4Pattern.exec(text)) !== null) {
      matches.push(match[0]);
      positions.push({ start: match.index, end: match.index + match[0].length });
    }

    while ((match = ipv6Pattern.exec(text)) !== null) {
      matches.push(match[0]);
      positions.push({ start: match.index, end: match.index + match[0].length });
    }

    return {
      found: matches.length > 0,
      matches,
      positions,
    };
  },
  replacement: '[IP_ADDRESS]',
};

/**
 * Email Address Detection
 */
export const emailPlugin: Plugin = {
  name: 'Email',
  detect: (text: string): DetectionResult => {
    const pattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const matches: string[] = [];
    const positions: { start: number; end: number }[] = [];
    let match;

    while ((match = pattern.exec(text)) !== null) {
      matches.push(match[0]);
      positions.push({ start: match.index, end: match.index + match[0].length });
    }

    return {
      found: matches.length > 0,
      matches,
      positions,
    };
  },
  replacement: '[EMAIL]',
};

/**
 * URL Detection
 */
export const urlPlugin: Plugin = {
  name: 'URL',
  detect: (text: string): DetectionResult => {
    const pattern = /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/g;
    const matches: string[] = [];
    const positions: { start: number; end: number }[] = [];
    let match;

    while ((match = pattern.exec(text)) !== null) {
      matches.push(match[0]);
      positions.push({ start: match.index, end: match.index + match[0].length });
    }

    return {
      found: matches.length > 0,
      matches,
      positions,
    };
  },
  replacement: '[URL]',
};

/**
 * IBAN Detection
 * Detects International Bank Account Numbers
 */
export const ibanPlugin: Plugin = {
  name: 'IBAN',
  detect: (text: string): DetectionResult => {
    // IBAN format: 2 letters (country code) + 2 digits (check digits) + up to 30 alphanumeric characters
    const pattern = /\b[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}\b/g;
    const matches: string[] = [];
    const positions: { start: number; end: number }[] = [];
    let match;

    while ((match = pattern.exec(text)) !== null) {
      // Basic validation: length between 15-34 characters
      if (match[0].length >= 15 && match[0].length <= 34) {
        matches.push(match[0]);
        positions.push({ start: match.index, end: match.index + match[0].length });
      }
    }

    return {
      found: matches.length > 0,
      matches,
      positions,
    };
  },
  replacement: '[IBAN]',
};

// Helper Functions

/**
 * Luhn algorithm for credit card validation
 */
function isValidLuhn(cardNumber: string): boolean {
  if (!/^\d+$/.test(cardNumber)) return false;

  let sum = 0;
  let isEven = false;

  for (let i = cardNumber.length - 1; i >= 0; i--) {
    let digit = parseInt(cardNumber[i], 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

// Default Plugins Registry
export const defaultPlugins: Plugin[] = [
  creditCardPlugin,
  ipAddressPlugin,
  emailPlugin,
  urlPlugin,
  ibanPlugin,
];

// Plugin map for easy lookup
export const pluginMap: Record<string, Plugin> = {
  'creditCard': creditCardPlugin,
  'ipAddress': ipAddressPlugin,
  'email': emailPlugin,
  'url': urlPlugin,
  'iban': ibanPlugin,
};

/**
 * Main Sanitization Function
 * @param userMessage - The user's input text to sanitize
 * @param enabledGuardrails - Array of enabled guardrail names
 * @returns Sanitization result with cleaned text and triggered plugins
 */
export function sanitize_user_message(
  userMessage: string,
  enabledGuardrails: string[] = []
): SanitizationResult {
  // Filter plugins based on enabled guardrails
  const activePlugins = enabledGuardrails
    .map(name => pluginMap[name])
    .filter(plugin => plugin !== undefined);

  // If no guardrails enabled, return original message
  if (activePlugins.length === 0) {
    return {
      sanitizedText: userMessage,
      triggeredPlugins: [],
      detections: {},
    };
  }

  let sanitizedText = userMessage;
  const triggeredPlugins: string[] = [];
  const detections: Record<string, string[]> = {};

  // Sort positions in reverse order to replace from end to start
  // This prevents position shifts during replacement
  const allReplacements: Array<{
    start: number;
    end: number;
    replacement: string;
    pluginName: string;
    originalValue: string;
  }> = [];

  // Collect all detections
  for (const plugin of activePlugins) {
    const result = plugin.detect(userMessage);

    if (result.found) {
      triggeredPlugins.push(plugin.name);
      detections[plugin.name] = result.matches;

      // Add replacements to the list
      for (let i = 0; i < result.positions.length; i++) {
        allReplacements.push({
          start: result.positions[i].start,
          end: result.positions[i].end,
          replacement: plugin.replacement || '[REDACTED]',
          pluginName: plugin.name,
          originalValue: result.matches[i],
        });
      }
    }
  }

  // Sort replacements by position (descending) to replace from end to start
  allReplacements.sort((a, b) => b.start - a.start);

  // Apply all replacements
  for (const replacement of allReplacements) {
    sanitizedText =
      sanitizedText.substring(0, replacement.start) +
      replacement.replacement +
      sanitizedText.substring(replacement.end);
  }

  return {
    sanitizedText,
    triggeredPlugins: [...new Set(triggeredPlugins)], // Remove duplicates
    detections,
  };
}
