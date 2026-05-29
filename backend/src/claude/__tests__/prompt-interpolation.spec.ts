/**
 * Standalone spec for the prompt-interpolation helper.
 *
 * Run with:
 *   cd backend
 *   npx tsx src/claude/__tests__/prompt-interpolation.spec.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { interpolatePromptVars } from '../prompt-interpolation';

test('substitutes a known variable', () => {
  const out = interpolatePromptVars('Hello {{user_name}}!', {
    user_name: 'markus',
  });
  assert.equal(out, 'Hello markus!');
});

test('leaves unknown variables literal', () => {
  const out = interpolatePromptVars('Hello {{nope}}!', {});
  assert.equal(out, 'Hello {{nope}}!');
});

test('keeps an unknown variable when other vars are present', () => {
  const out = interpolatePromptVars('{{user_name}} / {{nope}}', {
    user_name: 'markus',
  });
  assert.equal(out, 'markus / {{nope}}');
});

test('#if equality keeps the truthy branch', () => {
  const out = interpolatePromptVars(
    "before{{#if user_role==='user'}} EXPERT{{/if}} after",
    { user_role: 'user' },
  );
  assert.equal(out, 'before EXPERT after');
});

test('#if equality drops the falsy branch', () => {
  const out = interpolatePromptVars(
    "before{{#if user_role==='user'}} EXPERT{{/if}} after",
    { user_role: 'guest' },
  );
  assert.equal(out, 'before after');
});

test('#unless inverts #if', () => {
  const truthy = interpolatePromptVars(
    "{{#unless user_role==='user'}}GUEST{{/unless}}",
    { user_role: 'guest' },
  );
  const falsy = interpolatePromptVars(
    "{{#unless user_role==='user'}}GUEST{{/unless}}",
    { user_role: 'user' },
  );
  assert.equal(truthy, 'GUEST');
  assert.equal(falsy, '');
});

test('#if truthy-variable form (no equality) works', () => {
  const present = interpolatePromptVars(
    '{{#if user_name}}hi {{user_name}}{{/if}}',
    { user_name: 'markus' },
  );
  const missing = interpolatePromptVars(
    '{{#if user_name}}hi {{user_name}}{{/if}}',
    {},
  );
  assert.equal(present, 'hi markus');
  assert.equal(missing, '');
});

test('unrecognised condition expression fails closed (drops the block)', () => {
  const out = interpolatePromptVars(
    '{{#if some.weird.thing}}X{{/if}}',
    { 'some.weird.thing': 'whatever' },
  );
  assert.equal(out, '');
});

test('blocks survive when conditions reference variables that resolve later', () => {
  const tpl =
    '# Mission\n' +
    "{{#if user_role==='user'}}You are curating the wiki.{{/if}}" +
    "{{#unless user_role==='user'}}You are learning, {{user_display_name}}.{{/unless}}";
  const expert = interpolatePromptVars(tpl, {
    user_role: 'user',
    user_display_name: 'Anke',
  });
  const guest = interpolatePromptVars(tpl, {
    user_role: 'guest',
    user_display_name: 'Markus Lehmann',
  });
  assert.equal(expert, '# Mission\nYou are curating the wiki.');
  assert.equal(guest, '# Mission\nYou are learning, Markus Lehmann.');
});

test('empty template returns empty', () => {
  assert.equal(interpolatePromptVars('', { user_name: 'x' }), '');
});

test('template with no placeholders is returned unchanged', () => {
  const src = '# Mission\n\nNothing here to interpolate.\n';
  assert.equal(interpolatePromptVars(src, { user_name: 'x' }), src);
});
