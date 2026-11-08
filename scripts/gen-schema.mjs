// Turns db/schema.sql into functions/_lib/schema.ts (statements run on first request).
import { readFileSync, writeFileSync } from 'node:fs';
const sql = readFileSync('db/schema.sql', 'utf8').replace(/--[^\n]*/g, '');
const out = [];
let buf = '';
let inTrigger = false;
for (const line of sql.split('\n')) {
  buf += line + '\n';
  if (/CREATE TRIGGER/i.test(line)) inTrigger = true;
  if (inTrigger ? /^\s*END;\s*$/i.test(line) : /;\s*$/.test(line)) {
    const stmt = buf.trim().replace(/;\s*$/, '').replace(/[ \t]+\n/g, '\n');
    if (stmt) out.push(stmt);
    buf = '';
    inTrigger = false;
  }
}
writeFileSync('functions/_lib/schema.ts', `// generated from db/schema.sql — run: npm run gen:schema\nexport const SCHEMA: string[] = [\n${out.map((s) => '  ' + JSON.stringify(s)).join(',\n')},\n];\n`);
console.log(`${out.length} statements`);
