#!/usr/bin/env node
// chef-add-recipe entry point. Modes: url (add from a web page), draft (add from a recipe
// draft the agent wrote from pasted text, a photo, or a page with no recipe data).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { resolveDataRoot } from '../../../lib/data-root.mjs';
import { today } from '../../../lib/recipes.mjs';
import { addRecipe } from './lib/add.mjs';
import { fetchPage, httpUrl } from './lib/fetch-page.mjs';
import { draftFromHtml, htmlToText } from './lib/jsonld.mjs';
import { readSource, SOURCE_TYPES } from './lib/source-file.mjs';

const { values, positionals } = parseArgs({
  options: {
    'data-root': { type: 'string' },
    url: { type: 'string' },
    html: { type: 'string' },
    draft: { type: 'string' },
    kind: { type: 'string' },
    source: { type: 'string' },
    'dry-run': { type: 'boolean' },
  },
  allowPositionals: true,
});
const root = resolveDataRoot({ flag: values['data-root'] });
const invalid = (...problems) => ({ status: 'invalid-input', data_root: root, problems });
const PAGE_TEXT_LIMIT = 20000;

async function loadPage(url) {
  if (!values.html) return fetchPage(url);
  const { source, problem } = readSource(values.html, 'url');
  return problem ? { ok: false, reason: problem } : { ok: true, html: source.content.toString('utf8') };
}

function needsDraft(url, html, problems) {
  const pageFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-page-')), 'page.html');
  fs.writeFileSync(pageFile, html);
  const text = htmlToText(html);
  return { status: 'needs-draft', data_root: root, url, page_file: pageFile, problems, page_text: text.slice(0, PAGE_TEXT_LIMIT), page_text_truncated: text.length > PAGE_TEXT_LIMIT };
}

async function fromUrl() {
  if (!httpUrl(values.url)) return invalid('--url must be an http or https address');
  const page = await loadPage(values.url);
  if (!page.ok) return { status: 'fetch-failed', data_root: root, url: values.url, reason: page.reason };
  const draft = draftFromHtml(page.html);
  if (!draft) return needsDraft(values.url, page.html, ['the page has no schema.org recipe data']);
  const source = { ext: '.html', content: page.html };
  const result = addRecipe(root, { draft, kind: 'url', url: values.url, source, date: today(), dryRun: values['dry-run'] });
  return result.status === 'invalid-input' ? needsDraft(values.url, page.html, result.problems) : result;
}

function fromDraft() {
  const kind = values.kind;
  if (!Object.hasOwn(SOURCE_TYPES, kind)) return invalid(`--kind must be one of ${Object.keys(SOURCE_TYPES).join(', ')}`);
  if (kind === 'url' && !httpUrl(values.url)) return invalid('--url must be an http or https address when --kind is url');
  if (kind !== 'url' && values.url) return invalid('--url is only for --kind url');
  const { source, problem } = readSource(values.source, kind);
  if (problem) return invalid(problem);
  let draft;
  try {
    draft = JSON.parse(fs.readFileSync(values.draft ?? '', 'utf8'));
  } catch (error) {
    return invalid(`--draft must be a readable JSON file: ${error.message}`);
  }
  return addRecipe(root, { draft, kind, url: values.url, source, date: today(), dryRun: values['dry-run'] });
}

const MODES = { url: fromUrl, draft: fromDraft };
const mode = positionals[0];
if (!Object.hasOwn(MODES, mode)) {
  console.error(`Unknown mode "${mode}". Supported: ${Object.keys(MODES).join(', ')}`);
  process.exit(64);
}
const result = await MODES[mode]();
console.log(JSON.stringify(result));
if (['refused', 'invalid-input', 'fetch-failed'].includes(result.status)) process.exitCode = 2;
