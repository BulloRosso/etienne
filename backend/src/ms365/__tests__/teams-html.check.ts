/**
 * Self-checking test for teams-html.ts (the backend has no jest setup;
 * run with: npx tsx src/ms365/__tests__/teams-html.check.ts).
 * Exits non-zero on the first failed assertion.
 */
import { teamsHtmlToMarkdown, decodeEntities } from '../teams-html';

let failures = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.error(`FAIL  ${name}\n  expected: ${e}\n  actual:   ${a}`);
  }
}

// --- entity decoding ---
check('entities', decodeEntities('a &amp; b &lt;c&gt; &#65; &#x42; &nbsp;x'), 'a & b <c> A B  x');

// --- mentions ---
{
  const r = teamsHtmlToMarkdown('<p><at id="0">Jonas Weber</at> can you check?</p>');
  check('mention text', r.text, '@Jonas Weber can you check?');
  check('mention collected', r.mentions, ['Jonas Weber']);
}

// --- paragraphs & breaks ---
check('paragraphs', teamsHtmlToMarkdown('<p>one</p><p>two<br>three</p>').text, 'one\ntwo\nthree');

// --- emphasis ---
check('bold/italic/strike',
  teamsHtmlToMarkdown('<p><b>b</b> <strong>s</strong> <i>i</i> <em>e</em> <s>x</s></p>').text,
  '**b** **s** *i* *e* ~~x~~');

// --- links ---
check('links',
  teamsHtmlToMarkdown('<p>see <a href="https://example.com/x">the doc</a></p>').text,
  'see [the doc](https://example.com/x)');

// --- inline code + code block ---
check('inline code', teamsHtmlToMarkdown('<p>run <code>npm ci</code> now</p>').text, 'run `npm ci` now');
{
  const r = teamsHtmlToMarkdown('<p>before</p><pre>const a = 1;<br>const b = 2;</pre><p>after</p>');
  check('code block', r.text, 'before\n\n```\nconst a = 1;\nconst b = 2;\n```\nafter');
}

// --- code block entities preserved ---
check('code block entities',
  teamsHtmlToMarkdown('<pre>if (a &lt; b &amp;&amp; c &gt; d) {}</pre>').text,
  '```\nif (a < b && c > d) {}\n```');

// --- lists ---
check('list', teamsHtmlToMarkdown('<ul><li>one</li><li>two</li></ul>').text, '- one\n- two');

// --- blockquote ---
check('blockquote',
  teamsHtmlToMarkdown('<blockquote><p>quoted line</p></blockquote><p>reply</p>').text,
  '> quoted line\nreply');

// --- hosted content images ---
{
  const src = 'https://graph.microsoft.com/v1.0/teams/t1/channels/c1/messages/m1/hostedContents/HC42/$value';
  const r = teamsHtmlToMarkdown(`<p>shot: <img src="${src}"></p>`, (id) => `![img](assets/m1-${id}.png)`);
  check('hosted img rewritten', r.text, 'shot: ![img](assets/m1-HC42.png)');
  check('hosted ids collected', r.hostedContentIds, ['HC42']);
}
{
  const r = teamsHtmlToMarkdown('<p><img src="https://graph.microsoft.com/v1.0/teams/t/channels/c/messages/m/hostedContents/AB/$value"></p>');
  check('hosted img default', r.text, '[inline image]');
}

// --- attachment markers stripped ---
check('attachment marker stripped',
  teamsHtmlToMarkdown('<p>see file</p><attachment id="1234-abcd"></attachment>').text,
  'see file');

// --- plain-text-ish body (unknown tags stripped, entities decoded) ---
check('span stripped', teamsHtmlToMarkdown('<div><span style="color:red">hi&nbsp;there</span></div>').text, 'hi there');

// --- whitespace collapse (empty paragraphs collapse to one blank line) ---
check('collapse blank lines', teamsHtmlToMarkdown('<p>a</p><p></p><p></p><p>b</p>').text, 'a\n\nb');

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll teams-html checks passed');
