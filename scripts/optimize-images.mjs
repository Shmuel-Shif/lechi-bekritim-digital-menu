import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const assetSources = [
  { source: path.join(root, 'assets', 'images', 'dishes'), target: path.join(root, 'assets', 'images', 'dishes') },
  { source: path.join(root, 'assets', 'images', 'header foto'), target: path.join(root, 'assets', 'images', 'header foto') },
  { source: path.join(root, 'assets', 'images'), target: path.join(root, 'assets', 'images') },
  { source: path.join(root, 'assets', 'logo'), target: path.join(root, 'assets', 'logo') }
];

const SOURCE_EXT = /\.(jpe?g|png|webp)$/i;
const CODE_FILES = [
  path.join(root, 'js', 'menu-data.js'),
  path.join(root, 'js', 'main.js'),
  path.join(root, 'index.html')
];

async function optimizeImage(filePath, targetDir) {
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const outputPath = path.join(targetDir, `${base}.webp`);

  const buffer = await sharp(filePath)
    .resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

function syncCodePathsToWebp() {
  const replacements = [
    [/\.jpe?g(?=['"])/gi, '.webp'],
    [/\.png(?=['"])/gi, '.webp']
  ];

  CODE_FILES.forEach((filePath) => {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    replacements.forEach(([pattern, value]) => {
      const next = content.replace(pattern, value);
      if (next !== content) {
        content = next;
        changed = true;
      }
    });

    if (changed) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated paths: ${path.relative(root, filePath)}`);
    }
  });
}

function extractAssetPaths(content) {
  const paths = [];
  const regex = /'((?:\\'|[^'])*)'/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const value = match[1].replace(/\\'/g, "'");

    if (value.startsWith('assets/images/') || value.startsWith('assets/logo/')) {
      paths.push(value);
    }
  }

  return paths;
}

function validateAssetReferences() {
  const broken = [];
  const staleExt = [];

  CODE_FILES.forEach((filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    const refs = extractAssetPaths(content);

    refs.forEach((assetPath) => {
      if (/\.(jpe?g|png)$/i.test(assetPath)) {
        staleExt.push({ file: path.relative(root, filePath), assetPath });
      }

      const fullPath = path.join(root, ...assetPath.split('/'));

      if (!fs.existsSync(fullPath)) {
        broken.push({ file: path.relative(root, filePath), assetPath });
      }
    });
  });

  if (staleExt.length) {
    console.error('\nNon-WebP references found:');
    staleExt.forEach(({ file, assetPath }) => console.error(`  ${file}: ${assetPath}`));
    process.exitCode = 1;
  }

  if (broken.length) {
    console.error('\nBroken asset references:');
    broken.forEach(({ file, assetPath }) => console.error(`  ${file}: ${assetPath}`));
    process.exitCode = 1;
    return;
  }

  console.log('\nAll asset references are valid WebP paths.');
}

function finalizeDirectory(stagingDir, targetDir) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const stagedFiles = fs.readdirSync(stagingDir);

  let replaced = 0;
  let skipped = 0;

  stagedFiles.forEach((file) => {
    const from = path.join(stagingDir, file);
    const to = path.join(targetDir, file);
    const partPath = `${to}.part`;

    try {
      fs.writeFileSync(partPath, fs.readFileSync(from));

      if (fs.existsSync(to)) {
        fs.unlinkSync(to);
      }

      fs.renameSync(partPath, to);
      replaced += 1;
    } catch (error) {
      if (fs.existsSync(partPath)) {
        fs.unlinkSync(partPath);
      }
      skipped += 1;
      console.warn(`Skipped locked file: ${file}`);
    }
  });

  fs.readdirSync(targetDir).forEach((file) => {
    if (/\.(jpe?g|png|part)$/i.test(file)) {
      try {
        fs.unlinkSync(path.join(targetDir, file));
      } catch {
        console.warn(`Could not remove old file: ${file}`);
      }
    }
  });

  fs.rmSync(stagingDir, { recursive: true, force: true });
  console.log(`Applied ${replaced} file(s)${skipped ? `, skipped ${skipped} locked file(s)` : ''}.`);
}

async function main() {
  if (process.argv.includes('--validate-only')) {
    syncCodePathsToWebp();
    validateAssetReferences();
    return;
  }

  let count = 0;

  for (const { source, target } of assetSources) {
    if (!fs.existsSync(source)) {
      console.warn(`Skipping missing directory: ${source}`);
      continue;
    }

    const stagingDir = `${target}__staging`;

    if (fs.existsSync(stagingDir)) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }

    fs.mkdirSync(stagingDir, { recursive: true });
    const files = fs.readdirSync(source).filter((file) => SOURCE_EXT.test(file));

    for (const file of files) {
      const inputPath = path.join(source, file);
      const outputPath = await optimizeImage(inputPath, stagingDir);
      console.log(`Optimized: ${path.relative(root, outputPath)}`);
      count += 1;
    }

    finalizeDirectory(stagingDir, target);
    console.log(`Replaced directory: ${path.relative(root, target)}`);
  }

  console.log(`\nProcessed ${count} image(s).`);
  syncCodePathsToWebp();
  validateAssetReferences();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
