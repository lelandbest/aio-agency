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

const FORBIDDEN_UTILITY_REEXPORTS = [
  { name: 'toSnakeCase', service: 'crm.service' },
  { name: 'normalizeSourceUrl', service: 'forms.service' },
  { name: 'getApiBaseUrl', service: 'media.service' },
  { name: 'withSessionToken', service: 'media.service' },
  { name: 'validateTagFormat', service: 'crm.service' },
  { name: 'CANONICAL_TAG_PREFIXES', service: 'crm.service' },
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

function isBackupFile(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  return ['tmp', 'bak', 'old', 'orig', 'backup'].includes(ext);
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
      } else if (/\.(js|jsx|ts|tsx)$/.test(entry) || isBackupFile(full)) {
        files.push(full);
      }
    }
  } catch {
    // Directory may not exist in all worktrees
  }
  return files;
}

const violations = [];

const allFiles = scanDir(SRC_ROOT);

for (const file of allFiles) {
  if (isBackupFile(file)) {
    violations.push({
      file: relative(process.cwd(), file).replace(/\\/g, '/'),
      line: 0,
      type: 'BACKUP_FILE',
      detail: 'Backup/temp file found — must be deleted',
    });
    continue;
  }

  const content = readFileSync(file, 'utf-8');
  const rel = relative(process.cwd(), file).replace(/\\/g, '/');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Rule 1: Any file outside /services/ must not import from backendApi or /api/
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
      for (const { pat, type } of FORBIDDEN_CALL_PATTERNS) {
        if (pat.test(line)) {
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

    // Rule 3: Any file outside /services/ must not import utilities from service files
    if (isNonServiceFile(file)) {
      for (const util of FORBIDDEN_UTILITY_REEXPORTS) {
        const importPattern = new RegExp(`\\{[^}]*\\b${util.name}\\b[^}]*\\}\\s*from\\s*['"][^'"]*${util.service.replace('.', '\\.')}['"]`, 'i');
        if (importPattern.test(line)) {
          violations.push({
            file: rel,
            line: lineNum,
            type: 'UTILITY_FROM_SERVICE',
            detail: `${util.name} must be imported from /utils/, not from ${util.service}`,
          });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error('\n❌ Service-layer isolation VIOLATED:\n');
  for (const v of violations) {
    console.error(`  ${v.type}: ${v.file}${v.line ? `:${v.line}` : ''}`);
    console.error(`    ${v.detail}\n`);
  }
  console.error(`Total violations: ${violations.length}`);
  console.error('\nRules:');
  console.error('  1. UI modules must import API calls from /services/ only, not /api/ or backendApi');
  console.error('  2. UI modules must not use direct fetch(), axios(), or request()');
  console.error('  3. Utility functions (toSnakeCase, normalizeSourceUrl, etc.) must be imported from /utils/, not /services/');
  console.error('  4. No backup/temp files (.tmp, .bak, .old, .orig, .backup) allowed in src/\n');
  process.exit(1);
} else {
  console.log('✅ Service-layer isolation enforced. No violations found.');
  process.exit(0);
}