/**
 * Converts dish PNGs (Hebrew filenames) → assets/images/dishes/{id}.webp
 * Run: node scripts/convert-dishes-to-webp.mjs
 */
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const SOURCE_DIR = path.join(root, 'assets', 'images');
const DISHES_DIR = path.join(root, 'assets', 'images', 'dishes');
const LOGO_DIR = path.join(root, 'assets', 'logo');

/** Hebrew filename → slug id */
const FILE_TO_ID = {
  'פלטת סלטים לפתיחה.png': 'salad-plate',
  'חומוס הבית.png': 'hummus',
  'אנטיפסטי צבעוני_.png': 'antipasti',
  'פטריות חמות.png': 'mushrooms',
  'צ_יפס פריך.png': 'fries',
  'שעועית ירוקה מוקפצת_.png': 'green-beans',
  'תפוחי אדמה אפויים.png': 'baked-potatoes',
  'השניצל של השף.png': 'schnitzel',
  'סטייק פרגית בגריל.png': 'chicken-steak',
  'פילה דניס בתנור.png': 'denis',
  'נתח סלמון צרוב.png': 'salmon',
  'מתי סלמון צרוב.png': 'salmon',
  'נודלס סלמון אסייתי.png': 'noodles',
  'אורז לבן עסיסי.png': 'white-rice',
  'טורטייה סלמון ואבוקדו_.png': 'tortilla-salmon',
  'סלט פרגית עשיר.png': 'chicken-salad',
  'סלט קצוץ ישראלי.png': 'israeli-salad',
  'סלט עלים ירוקים_.png': 'green-salad',
  'פלטת פירות העונה.png': 'fruit-plate',
  'שייק פירות מרענן.png': 'fruit-shake',
  'קוקה קולה.png': 'coke',
  'קוקה קולה זירו.png': 'coke-zero',
  'פיוזטי.png': 'fuzetea',
  'סודה.png': 'soda',
  'מים מינרלים.png': 'water',
  'אספרסו.png': 'espresso',
  'קפה הפוך.png': 'cappuccino',
  'קפה שחור.png': 'black-coffee',
  'קפה קר ומרענן.png': 'iced-coffee',
  'תה חם עם נענע.png': 'mint-tea',
};

const REQUIRED_IDS = [
  'salad-plate', 'hummus', 'antipasti', 'mushrooms', 'fries',
  'schnitzel', 'chicken-steak', 'denis', 'salmon', 'noodles',
  'white-rice', 'baked-potatoes', 'green-beans',
  'tortilla-salmon', 'chicken-salad', 'israeli-salad', 'green-salad',
  'fruit-plate', 'coke', 'coke-zero', 'fuzetea', 'soda', 'water',
  'fruit-shake', 'espresso', 'cappuccino', 'black-coffee', 'mint-tea', 'iced-coffee',
];

const WEBP_QUALITY = 85;
const DISH_SIZE = 800;

async function convertToWebp(inputPath, outPath, size) {
  await sharp(inputPath)
    .resize({ width: size, height: size, fit: 'cover', position: 'centre' })
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toFile(outPath);
}

async function convertDishes() {
  await mkdir(DISHES_DIR, { recursive: true });

  const files = await readdir(SOURCE_DIR);
  const pngs = files.filter((f) => f.toLowerCase().endsWith('.png'));
  const created = new Set();

  for (const png of pngs) {
    const id = FILE_TO_ID[png];
    if (!id) {
      console.warn(`Skip (no mapping): ${png}`);
      continue;
    }

    const inputPath = path.join(SOURCE_DIR, png);
    const outPath = path.join(DISHES_DIR, `${id}.webp`);

    await convertToWebp(inputPath, outPath, DISH_SIZE);
    created.add(id);

    const { size: before } = await stat(inputPath);
    const { size: after } = await stat(outPath);
    const pct = ((1 - after / before) * 100).toFixed(0);
    console.log(`${png} → dishes/${id}.webp (−${pct}%)`);
  }

  const missing = REQUIRED_IDS.filter((id) => !created.has(id));
  if (missing.length) {
    console.warn('\nMissing dish images:', missing.join(', '));
  }

  return missing;
}

async function convertLogo() {
  const logoSrc = path.join(LOGO_DIR, 'logo.png');
  const logoOut = path.join(LOGO_DIR, 'logo.webp');

  try {
    await stat(logoSrc);
  } catch {
    console.warn('Skip logo: logo.png not found');
    return;
  }

  await sharp(logoSrc)
    .resize({ width: 560, withoutEnlargement: true })
    .webp({ quality: 88, effort: 4 })
    .toFile(logoOut);

  console.log('logo.png → logo/logo.webp');
}

async function main() {
  const missing = await convertDishes();
  await convertLogo();
  console.log('\nDone.');
  if (missing.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
