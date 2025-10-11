# Input guardrails
I want to implement a text parsing module in the backend in /src/input-guardrails which prevents sensitive information to be passed to the model.

We need to run this guardrails module to filter out any user input received from the frontend chat input BEFORE we pass it to the model.

## Frontend
In the project menu we need a new item "Guardrails" which opens a new modal window with the guardrails as checkbox options. initally all are unchecked.

We use the import { IoHandRightOutline } from "react-icons/io5"; to symbolize guardrails.

## Backend
The backend stores the guardrails configuration inside a file workspace/<project>/.etienne/input-guardrails.json and provides API methods to modify them under api/guardrails/<project>/input

When passing over the user message to the guardrails module we also pass a list of enabled (active) guardrails (according to input-guardrails.json)

## Example implementation
Key Features:

Plugin System: Each guardrail is a separate plugin with a standardized interface, making it easy to add new detectors
Built-in Plugins:

Credit Card: Detects card numbers with Luhn algorithm validation
IP Address: Detects both IPv4 and IPv6 addresses
Email: Detects email addresses
URL: Detects HTTP/HTTPS URLs
IBAN: Detects international bank account numbers


Smart Replacement: Replaces from end to start to avoid position shift issues
Detailed Results: Returns:

Sanitized text
List of triggered plugins
All detected values per plugin

Adding Custom Plugins:
```
  const phonePlugin: Plugin = {
  name: 'Phone Number',
  detect: (text: string): DetectionResult => {
    const pattern = /\b\+?[\d\s\-\(\)]{10,}\b/g;
    // ... implementation
  },
  replacement: '[PHONE]',
};

// Use with custom plugins
const result = sanitize_user_message(
  userMessage, 
  [...defaultPlugins, phonePlugin]
);
```

The module is production-ready with proper TypeScript typing and handles edge cases like overlapping matches and position tracking.

```
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

/**
 * Main Sanitization Function
 * @param userMessage - The user's input text to sanitize
 * @param plugins - Array of plugins to use (defaults to all built-in plugins)
 * @returns Sanitization result with cleaned text and triggered plugins
 */
export function sanitize_user_message(
  userMessage: string,
  plugins: Plugin[] = defaultPlugins
): SanitizationResult {
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
  for (const plugin of plugins) {
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

// Example usage
if (require.main === module) {
  const testMessage = `
    Please contact me at john.doe@example.com or visit https://example.com
    My IP is 192.168.1.1 and my card is 4532-1488-0343-6467
    Bank account: GB82WEST12345698765432
  `;

  const result = sanitize_user_message(testMessage);
  
  console.log('Original:', testMessage);
  console.log('\nSanitized:', result.sanitizedText);
  console.log('\nTriggered Plugins:', result.triggeredPlugins);
  console.log('\nDetections:', JSON.stringify(result.detections, null, 2));
}
```