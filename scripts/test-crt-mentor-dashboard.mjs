/**
 * Static checks for CRT-015 mentor dashboard migration (no database required).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261111_crt_mentor_dashboard.sql'),
  'utf8',
);

assert.match(migration, /CREATE OR REPLACE FUNCTION public\.crt_mentor_dashboard_filters/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.crt_mentor_dashboard_report/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.crt_compute_path_readiness/);
assert.match(migration, /0\.4 \* v_practice_accuracy/);
assert.match(migration, /0\.4 \* v_mock_accuracy/);
assert.match(migration, /0\.2 \* v_topic_coverage/);
assert.match(migration, /LIMIT 5/);
assert.match(migration, /a\.kind = 'mock'/);
assert.match(migration, /has_permission\('dashboard\.view'\)/);
assert.match(migration, /has_permission\('students\.manage'\)/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.crt_compute_path_readiness/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.crt_mentor_dashboard_filters/);
assert.match(migration, /readinessScore/);
assert.match(migration, /lastAttemptAt/);
assert.match(migration, /batch_members/);
assert.match(migration, /crt_path_assignments/);
assert.match(migration, /global.*dashboard\.view/s);
assert.match(migration, /default 7-day/i);
assert.match(migration, /cohort_pairs AS/);
assert.match(migration, /practice_scored AS/);
assert.match(migration, /0\.4 \* COALESCE\(pa\.practice_accuracy/);
assert.doesNotMatch(
  migration,
  /crt_compute_path_readiness\(c\.user_id, c\.path_id\)/
);

console.log('CRT mentor dashboard migration static checks passed.');
