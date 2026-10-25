import fs from 'fs';
import path from 'path';

// 1. Temporarily backup live agent_data.sqlite if it exists
const liveDbPath = path.resolve('agent_data.sqlite');
const backupPath = path.resolve('agent_data.sqlite.testbak');

if (fs.existsSync(liveDbPath)) {
  fs.renameSync(liveDbPath, backupPath);
}

try {
  console.log('Testing fresh clone first-start behavior (agent_data.sqlite does not exist)...');
  console.log('Exists before:', fs.existsSync(liveDbPath));

  // 2. Import getDatabase from 9_store.ts
  const { getDatabase } = await import('../src/pipeline/9_store.ts');
  const db = getDatabase();

  console.log('Exists after getDatabase():', fs.existsSync(liveDbPath));

  // 3. Inspect copied database
  const runs = db.prepare('SELECT id, test_case_id FROM pipeline_runs').all();
  console.log('Copied official runs count:', runs.length, runs.map(r => r.test_case_id));

  const siteChecks = db.prepare('SELECT COUNT(*) as count FROM site_checks').get().count;
  console.log('Copied site checks count:', siteChecks);

  if (runs.length === 4 && siteChecks === 0) {
    console.log('✓ Automatic seed copy verification SUCCESSFUL!');
  } else {
    throw new Error('Seed copy did not match expected records');
  }
} finally {
  // Restore backup if needed or keep clean seed
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }
}
