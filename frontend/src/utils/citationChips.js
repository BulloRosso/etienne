import { claudeEventBus, ClaudeEvents } from '../eventBus';
import { filePreviewHandler } from '../services/FilePreviewHandler';

const WIKI_TOKEN = /\[\[wiki:([a-z0-9/_-]+)\]\]/gi;
const DOC_TOKEN = /\[\[doc:([^\]\s]+)\]\]/gi;

const BOOK_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H6V4h2v8l2.5-1.5L13 12V4h5v16z"/></svg>';
const DOC_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/></svg>';

function baseChipStyle(chip) {
  chip.style.display = 'inline-flex';
  chip.style.alignItems = 'center';
  chip.style.justifyContent = 'center';
  chip.style.width = '16px';
  chip.style.height = '16px';
  chip.style.marginLeft = '2px';
  chip.style.marginRight = '2px';
  chip.style.verticalAlign = 'text-bottom';
  chip.style.borderRadius = '4px';
  chip.style.cursor = 'pointer';
  chip.style.userSelect = 'none';
  chip.style.lineHeight = '0';
}

function makeWikiChip(slug, projectName) {
  const chip = document.createElement('span');
  chip.className = 'wiki-citation-chip';
  chip.setAttribute('data-wiki-slug', slug);
  chip.setAttribute('role', 'button');
  chip.setAttribute('tabindex', '0');
  const display = slug.replace(/^(topics|sources)\//i, '');
  chip.setAttribute('title', display);
  chip.setAttribute('aria-label', `Open wiki page: ${display}`);
  baseChipStyle(chip);
  chip.style.backgroundColor = '#ede7f6';
  chip.style.color = '#4527a0';
  chip.innerHTML = BOOK_SVG;

  const open = () => {
    const filePath = /^(topics|sources)\//i.test(slug)
      ? `wiki/${slug}.md`
      : `wiki/topics/${slug}.md`;
    claudeEventBus.publish(ClaudeEvents.FILE_PREVIEW_REQUEST, {
      action: 'markdown-preview',
      filePath,
      projectName,
    });
  };
  chip.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); open(); });
  chip.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });
  return chip;
}

function makeDocChip(docPath, projectName) {
  const chip = document.createElement('span');
  chip.className = 'doc-citation-chip';
  chip.setAttribute('data-doc-path', docPath);
  chip.setAttribute('role', 'button');
  chip.setAttribute('tabindex', '0');
  const display = docPath.split(/[\\/]/).pop() || docPath;
  chip.setAttribute('title', display);
  chip.setAttribute('aria-label', `Open source document: ${display}`);
  baseChipStyle(chip);
  chip.style.backgroundColor = '#e0f2f1';
  chip.style.color = '#00695c';
  chip.innerHTML = DOC_SVG;

  const open = () => filePreviewHandler.handlePreview(docPath, projectName);
  chip.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); open(); });
  chip.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });
  return chip;
}

/**
 * Walk text nodes under `rootEl` and replace [[wiki:slug]] and [[doc:path]]
 * tokens with clickable icon-only chips. Safe to call multiple times — text
 * nodes already inside a chip are skipped.
 *
 * Intended for use inside a useEffect that depends on the rendered HTML, the
 * current project name, and the message direction (user messages should not
 * be linkified).
 */
export function applyCitationChips(rootEl, projectName) {
  if (!rootEl || !projectName) return;

  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (parent && parent.closest('.wiki-citation-chip, .doc-citation-chip')) continue;
    if (node.textContent.includes('[[wiki:') || node.textContent.includes('[[doc:')) {
      textNodes.push(node);
    }
  }

  for (const textNode of textNodes) {
    const text = textNode.textContent;
    // Collect all matches from both regexes, sorted by position so we splice in order.
    const matches = [];
    text.replace(WIKI_TOKEN, (full, slug, index) => {
      matches.push({ index, length: full.length, kind: 'wiki', value: slug });
      return full;
    });
    text.replace(DOC_TOKEN, (full, docPath, index) => {
      matches.push({ index, length: full.length, kind: 'doc', value: docPath });
      return full;
    });
    if (matches.length === 0) continue;
    matches.sort((a, b) => a.index - b.index);

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const m of matches) {
      if (m.index > cursor) {
        fragment.appendChild(document.createTextNode(text.substring(cursor, m.index)));
      }
      fragment.appendChild(
        m.kind === 'wiki'
          ? makeWikiChip(m.value, projectName)
          : makeDocChip(m.value, projectName)
      );
      cursor = m.index + m.length;
    }
    if (cursor < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(cursor)));
    }
    textNode.parentNode.replaceChild(fragment, textNode);
  }
}
