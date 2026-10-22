import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('agent_data.sqlite');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables);

for (const t of tables) {
  const count = db.prepare(`SELECT count(*) as count FROM ${t.name}`).get();
  console.log(`${t.name}: ${count.count} rows`);
}

const runs = db.prepare("SELECT id, test_case_id, approval_status, run_1_status, source_url FROM pipeline_runs").all();
console.log('\nPipeline Runs:');
runs.forEach(r => console.log(r));

const siteChecks = db.prepare("SELECT id, requested_url FROM site_checks").all();
console.log('\nSite Checks:');
siteChecks.forEach(s => console.log(s));
