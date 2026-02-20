import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(repoRoot, 'libs', 'prisma', 'prisma', 'schema');
const outputDir = path.join(repoRoot, 'libs', 'prisma', 'prisma', '.generated');
const outputPath = path.join(outputDir, 'sqlite.prisma');

const schemaFiles = fs
  .readdirSync(sourceDir)
  .filter((file) => file.endsWith('.prisma'))
  .filter((file) => file !== 'sqlite.prisma')
  .sort((a, b) => a.localeCompare(b));

if (!schemaFiles.includes('schema.prisma')) {
  throw new Error(`Missing schema.prisma in ${sourceDir}`);
}

const orderedFiles = [
  'schema.prisma',
  ...schemaFiles.filter((file) => file !== 'schema.prisma'),
];

let combinedSchema = orderedFiles
  .map((file) => fs.readFileSync(path.join(sourceDir, file), 'utf8').trimEnd())
  .join('\n\n');

const originalSchema = combinedSchema;

combinedSchema = combinedSchema.replace(
  /output\s*=\s*"[^"]+"/,
  'output   = "../../generated/prisma-sqlite"',
);

combinedSchema = combinedSchema.replace(/provider\s*=\s*"postgresql"/, 'provider = "sqlite"');

combinedSchema = combinedSchema
  .split('\n')
  .map((line) => {
    const scalarArrayField = line.match(/^(\s*\w+\s+)(String|Int)\[\](\??)(.*)$/);
    if (!scalarArrayField) {
      return line;
    }

    const [, prefix, , optionalMarker, suffix = ''] = scalarArrayField;
    const convertedSuffix = suffix.replace(/@default\(\[\]\)/g, '@default("[]")');
    return `${prefix}Json${optionalMarker}${convertedSuffix}`;
  })
  .join('\n');

combinedSchema = combinedSchema
  .replace(/\s+@db\.[A-Za-z0-9_]+(?:\([^)]*\))?/g, '')
  .split('\n')
  .map((line) => line.replace(/[ \t]+$/g, ''))
  .join('\n');

if (combinedSchema === originalSchema) {
  throw new Error('SQLite schema derivation produced no changes.');
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  outputPath,
  `// AUTO-GENERATED FILE. DO NOT EDIT.\n// Source: libs/prisma/prisma/schema/*.prisma\n\n${combinedSchema}\n`,
  'utf8',
);

console.log(`Derived SQLite Prisma schema -> ${path.relative(repoRoot, outputPath)}`);
