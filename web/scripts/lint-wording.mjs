import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '../src');

// Banned patterns per safety & regulatory compliance rules
const BANNED_PATTERNS = [
  { pattern: /tumou?r\s+detected/i, description: 'tumour detected' },
  { pattern: /diagnostic\s+system/i, description: 'diagnostic system' },
  { pattern: /replaces?\s+the\s+radiologist/i, description: 'replaces the radiologist' },
  { pattern: /clinical\s+diagnosis/i, description: 'clinical diagnosis' },
  // Disallow "is a diagnostic tool" or "acts as a diagnostic tool" unless negated (e.g., "not a diagnostic tool")
  {
    pattern: /(?<!not\s)(?<!never\s)(?<!no\s)(?<!isn't\s)is\s+a\s+diagnostic\s+tool/i,
    description: 'claim of being a diagnostic tool'
  },
  // Disallow claiming "diagnosis" on its own as a finding or conclusion
  {
    pattern: /\bprovides?\s+a\s+diagnosis\b/i,
    description: 'provides a diagnosis'
  }
];

// Allowlist for comments or strings explicitly documenting safety negation
const ALLOWLIST = [
  /not\s+a\s+diagnostic\s+tool/i,
  /does\s+not\s+replace\s+a\s+radiologist/i,
  /not\s+a\s+diagnosis/i,
  /banned/i,
  /linter/i
];

function scanDirectory(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') {
        scanDirectory(fullPath, fileList);
      }
    } else if (/\.(ts|tsx|js|jsx|json|css|html)$/.test(entry.name)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const files = scanDirectory(SRC_DIR);
let errorsFound = 0;

for (const filePath of files) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, lineIndex) => {
    // Check if line matches allowlist
    const isAllowed = ALLOWLIST.some((al) => al.test(line));
    if (isAllowed) return;

    for (const { pattern, description } of BANNED_PATTERNS) {
      if (pattern.test(line)) {
        console.error(
          `\x1b[31m[WORDING VIOLATION]\x1b[0m ${path.relative(SRC_DIR, filePath)}:${lineIndex + 1}`
        );
        console.error(`  Triggered banned phrase: "${description}"`);
        console.error(`  Line content: ${line.trim()}\n`);
        errorsFound++;
      }
    }
  });
}

if (errorsFound > 0) {
  console.error(
    `\x1b[31mFailed: Found ${errorsFound} wording violation(s) in src/. Remember to use approved phrases such as "suspected tumour region predicted by the model" and "estimated volume".\x1b[0m`
  );
  process.exit(1);
} else {
  console.log(`\x1b[32m✔ Wording linter passed: No banned phrases found in ${files.length} files.\x1b[0m`);
  process.exit(0);
}
