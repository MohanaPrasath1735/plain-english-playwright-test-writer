import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'conduit-app']);

const findings = [];

function searchDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(rootDir, fullPath);

    if (entry.isDirectory()) {
      if (!ignoreDirs.has(entry.name)) {
        searchDir(fullPath);
      }
    } else if (entry.isFile()) {
      // Don't inspect binary files or traces or large images
      const ext = path.extname(entry.name).toLowerCase();
      if (['.png', '.jpg', '.jpeg', '.zip', '.sqlite', '.sqlite3', '.db'].includes(ext)) {
        continue;
      }

      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          // Check for strings starting with AIza
          const matchAIza = line.match(/AIza[0-9A-Za-z\-_]{20,}/);
          if (matchAIza) {
            findings.push({
              file: relPath,
              line: idx + 1,
              type: 'AIza secret prefix',
              // NEVER print the actual secret - mask it
              masked: matchAIza[0].slice(0, 6) + '...' + matchAIza[0].slice(-4)
            });
          }

          // Check for API_KEY=
          const matchApiKey = line.match(/(?:GEMINI_)?API_KEY\s*=\s*(['"]?)([^'"\r\n\s]+)\1/);
          if (matchApiKey && matchApiKey[2] && matchApiKey[2] !== 'your_key_here' && matchApiKey[2] !== 'your_gemini_api_key_here') {
            findings.push({
              file: relPath,
              line: idx + 1,
              type: 'API_KEY assignment',
              masked: matchApiKey[2].slice(0, 4) + '...' + matchApiKey[2].slice(-4)
            });
          }
        });
      } catch (err) {
        // Skip unreadable files
      }
    }
  }
}

searchDir(rootDir);

console.log('Secret Search Results:');
console.log(`Total Findings: ${findings.length}`);
findings.forEach(f => {
  console.log(`- File: ${f.file}:${f.line} [${f.type}] (Pattern matched, value safely masked: ${f.masked})`);
});
