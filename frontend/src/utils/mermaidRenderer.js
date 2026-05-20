import mermaid from 'mermaid';

let lastTheme = null;

export function initMermaid(themeMode) {
  const theme = themeMode === 'dark' ? 'dark' : 'default';
  if (theme === lastTheme) return;
  mermaid.initialize({
    startOnLoad: false,
    theme,
    securityLevel: 'loose',
    fontFamily: 'Arial, sans-serif',
  });
  lastTheme = theme;
}

function makeId() {
  return `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function buildErrorNode(source, message) {
  const wrapper = document.createElement('div');
  wrapper.className = 'mermaid-error';
  wrapper.setAttribute('data-mermaid-rendered', 'true');
  wrapper.style.cssText = 'border:1px solid #d33;border-radius:4px;padding:8px 12px;margin:1em 0;background:rgba(211,51,51,0.05);';
  const label = document.createElement('div');
  label.style.cssText = 'color:#d33;font-size:0.85em;font-weight:600;margin-bottom:6px;';
  label.textContent = `Mermaid render error: ${message}`;
  const pre = document.createElement('pre');
  pre.style.cssText = 'margin:0;background:transparent;padding:0;font-size:0.85em;white-space:pre-wrap;';
  pre.textContent = source;
  wrapper.appendChild(label);
  wrapper.appendChild(pre);
  return wrapper;
}

export async function renderMermaidBlocks(containerEl) {
  if (!containerEl) return;
  const codes = containerEl.querySelectorAll('pre > code.language-mermaid');
  for (const code of codes) {
    const pre = code.parentElement;
    if (!pre || pre.closest('[data-mermaid-rendered="true"]')) continue;

    const source = code.textContent || '';
    const id = makeId();

    try {
      const { svg } = await mermaid.render(id, source);
      const wrapper = document.createElement('div');
      wrapper.className = 'mermaid-rendered';
      wrapper.setAttribute('data-mermaid-rendered', 'true');
      wrapper.innerHTML = svg;
      pre.replaceWith(wrapper);
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      pre.replaceWith(buildErrorNode(source, message));
    }
  }
}
