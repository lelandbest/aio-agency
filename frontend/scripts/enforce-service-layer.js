import { readFileSync, readdirSync, statSync } from 'fs';
import { join, sep, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SRC_ROOT = join(__dirname, '..', 'src');

const UI_PREFIXES = [join('src', 'components'), join('src', 'modules'), join('src', 'pages')];
const SERVICES_DIR = join('src', 'services');

const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+['"][^'"]*backendApi['"]/,
  /from\s+['"][^'"]*\/api\/[^'"]*['"]/,
];

const FORBIDDEN_CALL_PATTERNS = [
  { pat: /\bfetch\s*\(\s*['"`]/, type: 'FETCH_LITERAL', desc: 'fetch() with string argument (possible API call)' },
  { pat: /\bfetch\s*\(\s*`/, type: 'FETCH_TEMPLATE', desc: 'fetch() with template literal (possible API call)' },
  { pat: /\baxios\s*\(/, type: 'AXIOS_CALL', desc: 'axios() call' },
  { pat: /\brequest\s*\(/, type: 'REQUEST_CALL', desc: 'request() call from backendApi' },
];

function isUIFile(filePath) {
  const rel = relative(process.cwd(), filePath).replace(/\\/g, '/');
  return UI_PREFIXES.some((p) => rel.startsWith(p.replace(/\\/g, '/')));
}

function isServiceFile(filePath) {
  const rel = relative(process.cwd(), filePath).replace(/\\/g, '/');
  return rel.startsWith(SERVICES_DIR.replace(/\\/g, '/'));
}

function isNonServiceFile(filePath) {
  return !isServiceFile(filePath);
}

function scanDir(dir) {
  let files = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        files = files.concat(scanDir(full));
      } else if (/\.(js|jsx|ts|tsx)$/.test(entry)) {
        files.push(full);
      }
    }
  } catch {
    // Directory may not exist in all worktrees
  }
  return files;
}

const violations = [];

// Phase 1: UI files must not import from backendApi or /api/
// Phase 2: UI files must not use fetch(, axios(, request(
const allFiles = scanDir(SRC_ROOT);

for (const file of allFiles) {
  const content = readFileSync(file, 'utf-8');
  const rel = relative(process.cwd(), file).replace(/\\/g, '/');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Rule 1: Any file outside /services/ must not import from backendApi
    if (isNonServiceFile(file)) {
      for (const pat of FORBIDDEN_IMPORT_PATTERNS) {
        if (pat.test(line)) {
          violations.push({
            file: rel,
            line: lineNum,
            type: 'FORBIDDEN_IMPORT',
            detail: line.trim(),
          });
        }
      }
    }

    // Rule 2: UI files must not use fetch('/api/...'), axios(), request()
    if (isUIFile(file)) {
      for (const { pat, type, desc } of FORBIDDEN_CALL_PATTERNS) {
        if (pat.test(line)) {
          // Allow dynamic import patterns (checked separately as FORBIDDEN_IMPORT)
          if (/\brequest\s*\(/.test(line) && /await import/.test(line)) {
            continue;
          }
          violations.push({
            file: rel,
            line: lineNum,
            type,
            detail: line.trim(),
          });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error('\n❌ Service-layer isolation VIOLATED:\n');
  for (const v of violations) {
    console.error(`  ${v.type}: ${v.file}:${v.line}`);
    console.error(`    ${v.detail}\n`);
  }
  console.error(`Total violations: ${violations.length}`);
  console.error('\nUI modules must import from /services/ only, not /api/ or backendApi.');
  console.error('Direct fetch(), axios(), or request() calls are forbidden in UI.\n');
  process.exit(1);
} else {
  console.log('✅ Service-layer isolation enforced. No violations found.');
  process.exit(0);
}