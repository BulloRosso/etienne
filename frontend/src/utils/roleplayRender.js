// Roleplay rendering helpers shared between ChatMessage (non-timeline path)
// and TextSegmentTimeline (the timeline path used when the assistant message
// contains tool calls). The two paths both call marked() + DOMPurify on the
// agent's text, so the transformations are applied symmetrically:
//
//   1. Pre-marked: swap `<roleplay-start ...>` / `<roleplay-end ...>` tags
//      to sentinel tokens so marked/GFM does not auto-link or DOMPurify
//      strip them. The attribute payload is base64-encoded into the
//      sentinel so it survives intact.
//   2. Post-sanitize: swap the sentinels back to styled banner <div>s,
//      including an <img class="roleplay-banner-image" data-image-path="...">
//      placeholder for the start banner when the tag carried an `image=...`
//      attribute. The actual blob is loaded lazily by the caller via
//      attachRoleplayBannerImages — workspace files require an
//      Authorization header so a plain src= against /api/workspace/.../files
//      would 401.
//   3. Persona turns (`[Name]: …` at the start of a paragraph) are wrapped
//      with a styled span so the frontend can tint them.

import { apiFetch } from '../services/api';

const RP_START_OPEN = 'ROLEPLAYxSTARTxOPENx';
const RP_START_CLOSE = 'xCLOSExROLEPLAYxSTART';
const RP_END_OPEN = 'ROLEPLAYxENDxOPENx';
const RP_END_CLOSE = 'xCLOSExROLEPLAYxEND';

function parseAttrs(b64) {
  try {
    const decoded = decodeURIComponent(escape(atob(b64)));
    const attrs = {};
    decoded.replace(/(\w+)=["']([^"']*)["']/g, (_, k, v) => {
      attrs[k] = v;
      return '';
    });
    return attrs;
  } catch {
    return {};
  }
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Pre-marked pass — swap raw roleplay tags to base64 sentinels.
// `[^>]+?` (not `[^/>]+?`) — attribute values can contain `/` (e.g.
// `image="roleplay/images/foo.png"`). Trim a trailing `/` from the captured
// attrs so the self-closing `/` doesn't bleed into the last attribute match.
export function escapeRoleplayTags(text) {
  if (text == null) return '';
  let s = String(text);
  s = s.replace(
    /<roleplay-start\s+([^>]+?)\s*\/?>/g,
    (_, attrs) =>
      `${RP_START_OPEN}${btoa(unescape(encodeURIComponent(attrs.replace(/\/\s*$/, ''))))}${RP_START_CLOSE}`,
  );
  s = s.replace(
    /<roleplay-end\s+([^>]+?)\s*\/?>/g,
    (_, attrs) =>
      `${RP_END_OPEN}${btoa(unescape(encodeURIComponent(attrs.replace(/\/\s*$/, ''))))}${RP_END_CLOSE}`,
  );
  return s;
}

// Post-sanitize pass — restore sentinels as styled banner divs and wrap
// persona turns. `html` is the output of DOMPurify.sanitize(marked.parse(...)).
export function restoreRoleplayHtml(html) {
  let s = String(html);
  s = s.replace(
    new RegExp(`${RP_START_OPEN}([A-Za-z0-9+/=]+)${RP_START_CLOSE}`, 'g'),
    (_, b64) => {
      const a = parseAttrs(b64);
      const persona = esc(a.persona || 'persona');
      const topic = esc(a.topic || '');
      const scenario = esc(a.scenario || '');
      const image = a.image ? esc(a.image) : '';
      const imageEl = image
        ? `<img class="roleplay-banner-image" data-image-path="${image}" alt="${esc(a.topic || a.persona || 'scene')}" />`
        : '';
      return `<div class="roleplay-banner roleplay-banner-start" data-scenario="${scenario}"><div class="roleplay-banner-text"><span class="roleplay-banner-icon">🎭</span> <strong>Roleplay started</strong> — talking to <strong>${persona}</strong>${topic ? ` about ${topic}` : ''}</div>${imageEl}</div>`;
    },
  );
  s = s.replace(
    new RegExp(`${RP_END_OPEN}([A-Za-z0-9+/=]+)${RP_END_CLOSE}`, 'g'),
    (_, b64) => {
      const a = parseAttrs(b64);
      const turns = esc(a.turns || '');
      const scenario = esc(a.scenario || '');
      return `<div class="roleplay-banner roleplay-banner-end" data-scenario="${scenario}"><span class="roleplay-banner-icon">🎭</span> <strong>Roleplay ended</strong>${turns ? ` — ${turns} turns` : ''} — evaluation below ↓</div>`;
    },
  );
  // Wrap any whole paragraph that starts with `[Name]: ` as a persona turn,
  // plus any *following* paragraphs that belong to the same turn — marked
  // splits paragraphs on blank lines, so a multi-paragraph persona reply
  // produces several `<p>`s and only the first carries the `[Name]:` prefix.
  // Keep consuming subsequent `<p>...</p>` blocks until we hit one that
  // either starts with a different `[Other Name]:` prefix or until the
  // `<p>` chain ends (next sibling is something else, e.g. the roleplay-end
  // banner or a heading). Persona-name chars: letters, digits, spaces,
  // hyphens, dots, apostrophes (e.g. "Dr. Sabine Kraus", "Tom Reynolds").
  s = s.replace(
    /<p>\s*\[([A-Za-zÀ-ÿ0-9 .'\-]{1,40})\]:\s*([\s\S]*?)<\/p>(?:\s*<p>(?!\s*\[[A-Za-zÀ-ÿ0-9 .'\-]{1,40}\]:)([\s\S]*?)<\/p>)*/g,
    (match, name, firstRest) => {
      // The variable-length capture (?:...)* only retains the LAST iteration's
      // group, so the easy "use $3" trick fails for ≥2 follow-on paragraphs.
      // Re-scan the matched HTML to collect every trailing `<p>...</p>`.
      const followRegex = /<p>([\s\S]*?)<\/p>/g;
      const paragraphs = [];
      let m;
      let isFirst = true;
      while ((m = followRegex.exec(match)) !== null) {
        if (isFirst) {
          // Skip the leading `[Name]: ` paragraph — `firstRest` already has it.
          isFirst = false;
          continue;
        }
        paragraphs.push(m[1]);
      }
      const followHtml = paragraphs
        .map((p) => `<p class="roleplay-persona-follow">${p}</p>`)
        .join('');
      return `<div class="roleplay-persona-turn"><span class="roleplay-persona-name">${esc(name)}:</span> ${firstRest}${followHtml}</div>`;
    },
  );
  return s;
}

// Style block to spread into the rendered text container's `sx`. Both
// banner types + persona turn + the inline image placeholder.
export function roleplayStyles(themeMode) {
  return {
    '& .roleplay-banner': {
      display: 'block',
      padding: '8px 12px',
      margin: '0.5em 0',
      borderRadius: '6px',
      fontSize: '0.9em',
      textAlign: 'center',
    },
    '& .roleplay-banner-icon': { marginRight: '4px' },
    '& .roleplay-banner-start': {
      backgroundColor: themeMode === 'dark' ? '#3a2a4a' : '#f3e5f5',
      color: themeMode === 'dark' ? '#e1bee7' : '#6a1b9a',
      borderLeft: '4px solid #8e24aa',
    },
    '& .roleplay-banner-text': { marginBottom: '8px' },
    '& .roleplay-banner-image': {
      display: 'block',
      maxWidth: '100%',
      maxHeight: '320px',
      margin: '4px auto 0 auto',
      borderRadius: '4px',
      boxShadow:
        themeMode === 'dark'
          ? '0 2px 6px rgba(0,0,0,0.4)'
          : '0 2px 6px rgba(0,0,0,0.15)',
    },
    '& .roleplay-banner-end': {
      backgroundColor: themeMode === 'dark' ? '#2a3a4a' : '#e3f2fd',
      color: themeMode === 'dark' ? '#90caf9' : '#1565c0',
      borderLeft: '4px solid #1976d2',
    },
    '& .roleplay-persona-turn': {
      display: 'block',
      padding: '6px 10px',
      margin: '0.25em 0',
      borderLeft: '3px solid #8e24aa',
      backgroundColor:
        themeMode === 'dark' ? 'rgba(142, 36, 170, 0.12)' : 'rgba(142, 36, 170, 0.06)',
      borderRadius: '0 4px 4px 0',
    },
    '& .roleplay-persona-name': {
      fontWeight: 'bold',
      color: themeMode === 'dark' ? '#ce93d8' : '#6a1b9a',
      marginRight: '4px',
    },
    // Follow-up paragraphs within the same persona turn — keep them inside
    // the bubble with a touch of spacing but no extra margin/padding.
    '& .roleplay-persona-turn p.roleplay-persona-follow': {
      margin: '0.5em 0 0 0',
    },
  };
}

// Lazily fetch images for any <img.roleplay-banner-image[data-image-path]>
// placeholders inside `root`. Workspace files need an Authorization header,
// so a plain src= would 401. Returns a cleanup function that revokes the
// generated object URLs — call from a useEffect cleanup.
export function attachRoleplayBannerImages(root, projectName) {
  if (!root || !projectName) return () => {};
  const imgs = root.querySelectorAll(
    'img.roleplay-banner-image[data-image-path]',
  );
  if (imgs.length === 0) return () => {};
  const objectUrls = [];
  let cancelled = false;
  imgs.forEach(async (img) => {
    const path = img.getAttribute('data-image-path');
    if (!path || img.dataset.loaded === '1') return;
    img.dataset.loaded = '1';
    try {
      const resp = await apiFetch(
        `/api/workspace/${encodeURIComponent(projectName)}/files/${path}`,
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      if (cancelled) return;
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      img.src = url;
    } catch (err) {
      console.error('Failed to load roleplay banner image', path, err);
    }
  });
  return () => {
    cancelled = true;
    objectUrls.forEach((u) => URL.revokeObjectURL(u));
  };
}
