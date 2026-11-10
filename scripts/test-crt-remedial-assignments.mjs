/**
 * Static checks for CRT-016 remedial assignments migration (no database required).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261112_crt_remedial_assignments.sql'),
  'utf8',
);

assert.match(migration, /CREATE TABLE public\.crt_remedial_assignments/);
assert.match(migration, /status text NOT NULL DEFAULT 'open'/);
assert.match(migration, /CHECK \(status IN \('open', 'done'\)\)/);
assert.match(
  migration,
  /crt_remedial_assignments_open_user_module_uidx[\s\S]*WHERE status = 'open'/,
);
assert.match(migration, /FORCE ROW LEVEL SECURITY/);
assert.match(migration, /PREREQUISITE: Apply CRT-015 first/);
assert.match(
  migration,
  /CREATE TABLE public\.crt_remedial_assignments[\s\S]*CREATE OR REPLACE FUNCTION public\.crt_remedial_mark_done/,
);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.user_has_permission/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.user_has_permission/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.crt_remedial_assign_bulk/);
assert.match(migration, /crt_mentor_dashboard_require_access/);
assert.match(migration, /crt_user_assigned_path_access/);
assert.match(migration, /user_has_permission\(v_user_id, 'crt\.access'\)/);
assert.match(migration, /'assigned', v_assigned/);
assert.match(migration, /'skipped', v_skipped/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.crt_remedial_list_open_for_student/);
assert.match(migration, /'assignmentId'/);
assert.match(migration, /has_permission\('crt\.access'\)/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.crt_remedial_mark_done/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.crt_submit_attempt/);
assert.match(migration, /AND kind = 'practice'/);
assert.match(migration, /GET DIAGNOSTICS v_attempt_rows = ROW_COUNT/);
assert.match(
  migration,
  /IF v_module IS NOT NULL AND v_attempt_rows = 1 THEN[\s\S]*crt_remedial_mark_done\(v_user, v_module, v_submitted\)/,
);
assert.match(migration, /Students read own open crt remedial assignments/);
assert.doesNotMatch(
  migration,
  /GRANT INSERT ON TABLE public\.crt_remedial_assignments TO authenticated/,
);
assert.doesNotMatch(
  migration,
  /GRANT UPDATE ON TABLE public\.crt_remedial_assignments TO authenticated/,
);
assert.doesNotMatch(
  migration,
  /FOR (INSERT|UPDATE|DELETE) TO authenticated/,
);

console.log('CRT remedial assignments migration static checks passed.');
