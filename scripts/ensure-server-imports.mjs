import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const files = execFileSync('rg', ['-l', '@/integrations/supabase/client.server|integrations/supabase/client.server', 'src'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean);

const offenders = [];

for (const file of files) {
  if (!file.endsWith('.functions.ts') && !file.endsWith('.functions.tsx')) continue;
  const source = readFileSync(join(root, file), 'utf8');
  const lines = source.split('\n');
  lines.forEach((line, index) => {
    if (/^\s*import\s+.*['"]@\/integrations\/supabase\/client\.server['"]/.test(line)) {
      offenders.push(`${file}:${index + 1}`);
    }
  });
}

if (offenders.length > 0) {
  console.error('\n[server-import-guard] Deployment gestoppt: client.server darf in *.functions.ts nicht auf Modulebene importiert werden.');
  console.error('[server-import-guard] Bitte innerhalb des .handler() nach der Auth-/Admin-Prüfung dynamisch laden:');
  console.error('[server-import-guard] const { supabaseAdmin } = await import("@/integrations/supabase/client.server");');
  console.error(offenders.map((entry) => `  - ${entry}`).join('\n'));
  process.exit(1);
}