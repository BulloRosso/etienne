---
name: web-scraping
description: "Crawl and extract content from websites. Saves pages as Markdown, HTML, or text into the web-crawling/ folder, organized by site. Supports static pages, JavaScript-heavy sites, and sites with bot protection."
---

# Web Scraping

This skill lets you crawl websites and extract their content. All results are saved to `web-crawling/` inside the project directory, organized by site name. The skill connects to the **web-scraper** MCP server which provides six tools at different protection levels.

## Dependencies

This skill requires the **web-scraper** service to be running (port 3480). If it is not running, start it via the process manager before proceeding.

## When to Use This Skill

Activate this skill when the user wants to:

- Scrape, crawl, or download content from one or more web pages
- Extract specific parts of a website using CSS selectors
- Save website content for offline reading or analysis
- Collect data from multiple URLs in bulk
- Access pages that require JavaScript rendering
- Access pages behind Cloudflare or other bot protections

Trigger phrases include: "scrape this page", "crawl this website", "grab the content from", "download this page", "extract data from", "fetch this URL".

## What You Can Do

When the user asks about web scraping capabilities, explain clearly in plain language:

**Three levels of page retrieval, from fast to thorough:**

1. **Quick retrieval** — Fast HTTP requests that work on most regular websites (blogs, news sites, documentation, wikis). This is the default and fastest option. It mimics a real browser's network signature to avoid basic blocks.

2. **Browser-based retrieval** — Opens a real headless browser to load the page. Use this when the website relies on JavaScript to render its content (single-page apps, dynamic dashboards, infinite scroll pages). Slower than quick retrieval but sees the page as a real user would.

3. **Stealth retrieval** — A hardened browser mode designed to bypass advanced bot detection (Cloudflare challenges, CAPTCHAs, aggressive fingerprinting). Use this as a last resort when the other methods get blocked. Can also solve Cloudflare Turnstile challenges automatically.

**Content extraction options:**

- **Markdown** (default) — Clean, readable text with formatting preserved. Best for most use cases.
- **HTML** — Raw HTML source. Useful when the user needs the exact page structure.
- **Text** — Plain text with no formatting. Useful for data processing.

**CSS selector filtering** — The user can request only specific parts of a page (e.g., "just the article body", "only the product prices", "the main table"). You can pass CSS selectors to narrow down what gets returned, dramatically reducing noise.

**Bulk operations** — All three retrieval levels support fetching multiple URLs at once in parallel, which is much faster than fetching them one by one.

## Limitations

Be upfront with the user about these limitations:

- **No login/authentication** — Cannot access pages behind a login form. The tools can send custom cookies and headers, but cannot interactively log in to a website.
- **No recursive crawling** — Each request fetches one page (or a list of explicit URLs). It does not automatically follow links to discover and crawl an entire site. You must identify and provide the URLs yourself.
- **Rate limits and blocking** — Websites may block or rate-limit requests. Space out requests when crawling multiple pages from the same domain. There is no built-in delay between requests, so add pauses yourself when needed.
- **Large pages** — Very large pages may produce large output. Use CSS selectors to limit what gets extracted.
- **Dynamic content timing** — For browser-based retrieval, some pages may need extra wait time for JavaScript to finish loading. You can configure timeouts and wait conditions, but some very slow pages may still return incomplete content.

## File & Folder Conventions

### Output directory
All scraped content goes into `web-crawling/` at the project root. Create it if it does not exist.

### Site folders
Inside `web-crawling/`, create a subfolder for each website, named after the domain (lowercase, hyphens for dots):

- `https://example.com/page` &rarr; `web-crawling/example-com/`
- `https://docs.python.org/3/` &rarr; `web-crawling/docs-python-org/`
- `https://blog.example.co.uk/post` &rarr; `web-crawling/blog-example-co-uk/`

### File naming
Name files after the page path, sanitized to be filesystem-safe. Use the extraction type as extension:

- `web-crawling/example-com/about.md`
- `web-crawling/example-com/products/widget-123.md`
- `web-crawling/docs-python-org/3/library/json.md`

For the root page (`/`), use `index.md`.

### Index file
Maintain `web-crawling/crawl-log.md` as a log of all crawled pages:

```markdown
# Web Crawling Log

_Last updated: <date>_

## example-com

| Page | File | Retrieved | Method |
|------|------|-----------|--------|
| https://example.com/ | [index.md](web-crawling/example-com/index.md) | 2026-02-27 | quick |
| https://example.com/about | [about.md](web-crawling/example-com/about.md) | 2026-02-27 | quick |

## docs-python-org

| Page | File | Retrieved | Method |
|------|------|-----------|--------|
| https://docs.python.org/3/library/json.html | [3/library/json.md](web-crawling/docs-python-org/3/library/json.md) | 2026-02-27 | browser |
```

Update this log after every crawl operation.

## Workflow

### 1. Understand the request
Ask the user what they want to scrape:
- Which URL(s)?
- Do they need the full page or specific parts (CSS selector)?
- What format (markdown, HTML, text)? Default to markdown if not specified.

### 2. Choose the retrieval method
Select the appropriate tool based on the target site:

| Situation | Tool | Why |
|-----------|------|-----|
| Regular static website | `get` | Fast, efficient, works for most sites |
| Multiple URLs from the same site | `bulk_get` | Parallel fetching, much faster |
| JavaScript-rendered page (SPA, React, etc.) | `fetch` | Needs a real browser to render |
| Multiple JS-rendered pages | `bulk_fetch` | Parallel browser tabs |
| Site with bot protection (Cloudflare, etc.) | `stealthy_fetch` | Bypasses advanced detection |
| Multiple protected pages | `bulk_stealthy_fetch` | Parallel stealth sessions |

**Start with `get` by default.** Only escalate to `fetch` or `stealthy_fetch` if:
- The user says the site uses JavaScript rendering
- The `get` tool returns empty or minimal content (likely JS-rendered)
- The `get` or `fetch` tool gets blocked (403, CAPTCHA page, Cloudflare challenge)

When escalating, inform the user: "The page appears to need browser rendering, switching to a more thorough retrieval method."

### 3. Make the request
Call the appropriate MCP tool. Key parameters to use:

**For `get` / `bulk_get`:**
- `url` / `urls`: The target URL(s)
- `extraction_type`: `"markdown"` (default), `"html"`, or `"text"`
- `css_selector`: Optional CSS selector to narrow results
- `main_content_only`: `true` (default) — extracts only the body content, skipping navbars, footers, etc.

**For `fetch` / `bulk_fetch`:**
- Same as above, plus:
- `network_idle`: Set to `true` for pages that load content dynamically after initial page load
- `wait`: Milliseconds to wait after page load (useful for slow-loading content)
- `wait_selector`: CSS selector to wait for before extracting (e.g., wait until a specific element appears)
- `disable_resources`: Set to `true` to skip loading images/fonts/media for faster page loads

**For `stealthy_fetch` / `bulk_stealthy_fetch`:**
- Same as `fetch`, plus:
- `solve_cloudflare`: Set to `true` to automatically solve Cloudflare Turnstile challenges

### 4. Save the results
1. Create the directory structure: `web-crawling/<site-folder>/`
2. Write the extracted content to the appropriate file
3. Update `web-crawling/crawl-log.md`

### 5. Present results
After saving:
- Confirm what was saved and where
- Show a brief preview of the content (first few lines)
- If the content seems incomplete or was blocked, suggest trying a different retrieval method

## MCP Tools Reference

All tools are provided by the **web-scraper** MCP server.

### get
Fast HTTP request with browser fingerprint impersonation. Best for static websites.
- `url` (string, required): The URL to fetch
- `extraction_type` (string): `"markdown"`, `"html"`, or `"text"`. Default: `"markdown"`
- `css_selector` (string): CSS selector to extract specific elements
- `main_content_only` (bool): Extract only body content. Default: true
- Returns: Structured response with `content`, `url`, `status_code`

### bulk_get
Fetch multiple URLs in parallel via HTTP.
- `urls` (list of strings, required): URLs to fetch
- Same options as `get`
- Returns: List of responses, one per URL

### fetch
Browser-based fetching using headless Chromium. For JavaScript-rendered pages.
- `url` (string, required): The URL to fetch
- `extraction_type`, `css_selector`, `main_content_only`: Same as `get`
- `network_idle` (bool): Wait for no network activity. Default: false
- `wait` (number): Extra milliseconds to wait after load. Default: 0
- `wait_selector` (string): CSS selector to wait for before extracting
- `disable_resources` (bool): Skip images/fonts/media. Default: false
- `timeout` (number): Timeout in milliseconds. Default: 30000

### bulk_fetch
Fetch multiple URLs in parallel browser tabs.
- `urls` (list of strings, required): URLs to fetch
- Same options as `fetch`
- Returns: List of responses

### stealthy_fetch
Hardened browser mode for sites with advanced bot protection.
- Same options as `fetch`, plus:
- `solve_cloudflare` (bool): Auto-solve Cloudflare challenges. Default: false
- `block_webrtc` (bool): Prevent local IP leak. Default: false
- `hide_canvas` (bool): Prevent canvas fingerprinting. Default: false

### bulk_stealthy_fetch
Parallel stealth fetching for multiple protected URLs.
- `urls` (list of strings, required): URLs to fetch
- Same options as `stealthy_fetch`
- Returns: List of responses

## Example Interactions

### Example 1: Simple page scrape

**User**: "Scrape the Python json module documentation at https://docs.python.org/3/library/json.html"

**Agent**:
1. Calls `get` with url `https://docs.python.org/3/library/json.html`, extraction_type `"markdown"`
2. Creates `web-crawling/docs-python-org/3/library/json.md`
3. Updates crawl log

"I've saved the Python json module documentation to `web-crawling/docs-python-org/3/library/json.md`. Here's a preview:

> # json - JSON encoder and decoder
> Source code: Lib/json/__init__.py
> JSON (JavaScript Object Notation) is a lightweight data interchange format..."

### Example 2: Multiple pages with CSS selector

**User**: "Grab just the article content from these three blog posts: [url1], [url2], [url3]"

**Agent**:
1. Calls `bulk_get` with the three URLs, css_selector `"article"` or `".post-content"` (infer from context or try common selectors)
2. Saves each to `web-crawling/<domain>/...`
3. Updates crawl log

"Done! I've saved all three articles to the `web-crawling/` folder. I used a CSS selector to grab just the article body, skipping navigation and sidebars."

### Example 3: JavaScript-rendered page (escalation)

**User**: "Scrape this React dashboard at https://app.example.com/dashboard"

**Agent**:
1. First tries `get` — content comes back nearly empty
2. Informs user: "The page appears to use JavaScript rendering. Switching to browser-based retrieval."
3. Calls `fetch` with url, network_idle `true`
4. Saves result

### Example 4: Cloudflare-protected site

**User**: "I need the content from https://protected-site.com but it has Cloudflare"

**Agent**:
1. Calls `stealthy_fetch` with solve_cloudflare `true`
2. Saves result

"I've retrieved the page using stealth mode with Cloudflare challenge solving. Content saved to `web-crawling/protected-site-com/index.md`."

## Error Handling

- **Empty or minimal content from `get`**: Suggest escalating to `fetch` (likely JS-rendered)
- **403 / blocked response**: Suggest escalating to `stealthy_fetch`
- **Timeout**: Suggest increasing the `timeout` parameter or using `wait` for slow pages
- **CSS selector returns nothing**: Inform the user the selector didn't match. Suggest trying without the selector first to see the full page structure, then refining.
- **Web-scraper service not running**: Inform the user that the Web Scraper service needs to be started via the process manager.

## Notes

- Always default to `extraction_type: "markdown"` unless the user specifically asks for HTML or text. Markdown is the most useful format for further analysis and is the most token-efficient.
- When scraping multiple pages from the same domain, consider adding a brief pause between requests to be respectful of the server.
- The `main_content_only` parameter (default true) strips navigation, footers, and sidebars. Disable it only if the user explicitly needs the full page structure.
- Domain folder names are derived by replacing dots with hyphens: `docs.python.org` becomes `docs-python-org`.
