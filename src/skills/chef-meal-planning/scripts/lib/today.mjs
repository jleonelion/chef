import fs from 'node:fs';
import path from 'node:path';
import { parsePage } from '../../../../lib/frontmatter.mjs';
import { WIKI_DIR, WIKI_FOLDERS } from '../../../../lib/wiki.mjs';

const PLANS_DIR = `${WIKI_DIR}/${WIKI_FOLDERS['meal-plan']}`;

function plans(root) {
  const dir = path.join(root, PLANS_DIR);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith('.md')).sort().reverse() : [];
  return files.flatMap((file) => {
    try {
      const frontmatter = parsePage(fs.readFileSync(path.join(dir, file), 'utf8')).frontmatter;
      return frontmatter.type === 'meal-plan' && Array.isArray(frontmatter.meals)
        ? [{ path: `${PLANS_DIR}/${file}`, frontmatter }]
        : [];
    } catch {
      return [];
    }
  });
}

export function todayPlan(root, date) {
  const plan = plans(root).find(({ frontmatter }) => frontmatter.meals.some((meal) => meal.date === date));
  if (!plan) return { status: 'no-plan', data_root: root, date, message: `No meal plan covers ${date}.` };

  const footer = plan.frontmatter.dietary?.footer;
  return {
    status: 'planned',
    data_root: root,
    date,
    meal_plan: plan.path,
    meals: plan.frontmatter.meals.filter((meal) => meal.date === date),
    ...(typeof footer === 'string' && footer ? { dietary: { footer } } : {}),
  };
}
