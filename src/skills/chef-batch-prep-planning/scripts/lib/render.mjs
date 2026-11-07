import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, PageSizes, StandardFonts, rgb } from 'pdf-lib';
import { gateRecipe } from '../../../../lib/dietary-gate.mjs';
import { dietaryNotes, readRuleset } from '../../../../lib/dietary-ruleset.mjs';
import { parsePage } from '../../../../lib/frontmatter.mjs';
import { listRecipes } from '../../../../lib/recipes.mjs';
import { muse } from '../../../../runtime/muse.mjs';
import { writeWiki } from '../../../../lib/wiki.mjs';

const PLAN_DIR = 'knowledge/wiki/meal-plans';
const OUTPUT_DIR = 'data/batch-prep-plans';
const MARGIN = 54;

function stepLines(body) {
  const section = body.split(/^## /m).find((part) => /^steps\s*$/im.test(part.split('\n')[0]));
  if (!section) return [];
  return section.split('\n')
    .map((line) => line.match(/^\s*(?:\d+[.)]|[-*])\s+(.+)$/)?.[1].trim())
    .filter(Boolean);
}

function wrap(text, font, size, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function drawRecipePage(pdf, fonts, group, dietary) {
  const page = pdf.addPage(PageSizes.Letter);
  const { width, height } = page.getSize();
  let y = height - MARGIN;
  page.drawText('BATCH PREP PLAN', { x: MARGIN, y, size: 10, font: fonts.bold, color: rgb(0.35, 0.35, 0.35) });
  y -= 32;
  for (const line of wrap(group.title, fonts.bold, 23, width - MARGIN * 2)) {
    page.drawText(line, { x: MARGIN, y, size: 23, font: fonts.bold, color: rgb(0.12, 0.22, 0.18) });
    y -= 28;
  }
  page.drawText(`Planned: ${group.meals.map((meal) => meal.date).join(', ')}`, { x: MARGIN, y, size: 10, font: fonts.regular });
  y -= 16;
  page.drawText(`Servings: ${group.meals.map((meal) => meal.servings).join(', ')}`, { x: MARGIN, y, size: 10, font: fonts.regular });
  y -= 30;
  page.drawText('PREP STEPS', { x: MARGIN, y, size: 12, font: fonts.bold });
  y -= 24;
  const steps = group.steps.length ? group.steps : ['Review the recipe before starting.'];
  for (const step of steps) {
    page.drawRectangle({ x: MARGIN, y: y - 1, width: 9, height: 9, borderWidth: 1, borderColor: rgb(0.25, 0.25, 0.25) });
    const lines = wrap(step, fonts.regular, 11, width - MARGIN * 2 - 22);
    for (const line of lines) {
      page.drawText(line, { x: MARGIN + 20, y, size: 11, font: fonts.regular });
      y -= 15;
    }
    y -= 9;
  }
  const note = dietary.footer ?? dietary.nudge;
  if (note) {
    const lines = wrap(note, fonts.regular, 8, width - MARGIN * 2);
    let footerY = MARGIN + (lines.length - 1) * 10;
    for (const line of lines) {
      page.drawText(line, { x: MARGIN, y: footerY, size: 8, font: fonts.regular, color: rgb(0.35, 0.35, 0.35) });
      footerY -= 10;
    }
  }
}

async function pdfBytes(weekStart, groups, dietary) {
  const pdf = await PDFDocument.create();
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const fixedDate = new Date(`${weekStart}T00:00:00Z`);
  pdf.setTitle(`Batch prep plan: week of ${weekStart}`);
  pdf.setSubject(`Recipe titles: ${groups.map((group) => group.title).join(' | ')}`);
  pdf.setCreator('Chef');
  pdf.setProducer('Chef');
  pdf.setCreationDate(fixedDate);
  pdf.setModificationDate(fixedDate);
  for (const group of groups) drawRecipePage(pdf, fonts, group, dietary);
  return pdf.save({ useObjectStreams: false });
}

function loadPlan(root, weekStart) {
  const relative = `${PLAN_DIR}/${weekStart}.md`;
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) return { problem: { status: 'not-found', reason: `no saved meal plan for ${weekStart}` } };
  try {
    const plan = parsePage(fs.readFileSync(file, 'utf8')).frontmatter;
    if (plan.type !== 'meal-plan' || !Array.isArray(plan.meals) || !plan.meals.length) throw new Error('meal plan has no meals');
    return { plan, relative };
  } catch (error) {
    return { problem: { status: 'refused', reason: `saved meal plan cannot be read: ${error.message}` } };
  }
}

export async function renderBatchPrep(root, weekStart) {
  const { plan, relative, problem } = loadPlan(root, weekStart);
  if (problem) return { ...problem, data_root: root, week_start: weekStart };
  const { recipes, unreadable } = listRecipes(root);
  const bySlug = new Map(recipes.map((recipe) => [recipe.slug, recipe]));
  const missing = [...new Set(plan.meals.map((meal) => meal.slug).filter((slug) => !bySlug.has(slug)))];
  if (missing.length) return { status: 'refused', data_root: root, week_start: weekStart, reason: 'saved meal plan references unavailable recipes', missing, unreadable };

  const ruleset = readRuleset(root);
  const slugs = [...new Set(plan.meals.map((meal) => meal.slug))];
  const blocked = slugs.flatMap((slug) => {
    const recipe = bySlug.get(slug);
    const reasons = [...(recipe.frontmatter.lifecycle === 'retired' ? [{ why: 'retired' }] : []), ...gateRecipe(recipe, ruleset).reasons];
    return reasons.length ? [{ slug, title: recipe.frontmatter.title ?? slug, reasons }] : [];
  });
  const dietary = dietaryNotes(ruleset);
  if (blocked.length) return { status: 'refused', data_root: root, week_start: weekStart, reason: 'saved meal plan has recipes that are retired or no longer pass the dietary gate', blocked, dietary };

  const groups = slugs.map((slug) => {
    const recipe = bySlug.get(slug);
    return {
      slug,
      title: recipe.frontmatter.title ?? slug,
      meals: plan.meals.filter((meal) => meal.slug === slug),
      steps: stepLines(recipe.body),
    };
  });
  const output = `${OUTPUT_DIR}/${weekStart}.pdf`;
  const write = writeWiki(root, {
    data: [{ path: output, content: await pdfBytes(weekStart, groups, dietary) }],
    message: `Render batch prep plan for week of ${weekStart}`,
  });
  if (write.status !== 'written') return write;
  return {
    status: 'rendered',
    data_root: root,
    path: output,
    meal_plan: relative,
    week_start: weekStart,
    pages: groups.length,
    recipes: groups.map(({ slug, title }) => ({ slug, title })),
    dietary,
    ...muse.attachment(path.join(root, output)),
  };
}
