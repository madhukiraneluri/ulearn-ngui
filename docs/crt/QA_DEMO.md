# CRT-018 — End-to-End QA Demo Documentation

## 1. Purpose and scope

This document is the script for a QA pass of the implemented CRT path, from an admin publishing content through a student submission to the mentor dashboard.

It describes behaviour that is present in the Angular routes, components, and services, and in `docs/crt/readiness.md`. `docs/crt/wireframes.md` is a CRT-001 draft for student screens. It is reference only and is not the specification for this demo. Where the draft and the app differ, follow this document.

No step in this document has been executed. Unchecked boxes mean the step has not been verified.

In scope:

- Create and publish a learning path, add modules and questions, save a mock blueprint, and assign the path to a batch.
- A student with Allowed CRT opens that path, submits practice, submits a mock, and sees readiness on CRT Home.
- A mentor reloads `/admin/crt/mentors` and checks that student's readiness and last submitted attempt.

Out of scope:

- Company packs (`/crt/packs`). Pack attempts are not practice or mock attempts and do not feed readiness or the mentor report.
- Topic strength (`/crt/skills`), attempt history review, and remedial module assignment.
- Analytics at `/admin/crt/analytics`.

## 2. Test prerequisites and required permissions

Use a non-production Supabase project, or a disposable set of records in a test project. Do not use a real student's account. Do not paste passwords, access tokens, or API keys into this file or into screenshots.

| Who | How they get in | Permission |
| --- | --- | --- |
| Admin content editor | Signed in, and able to open `/admin` (profile role `ADMIN`, or a staff label with portal access) | `crt.access` for paths, modules, and questions |
| Admin who assigns the path | Same portal access | `batches.manage` for `/admin/crt/assignments` and for adding the student to the batch |
| Student | Signed in at the student site. Portal access is not required | `crt.access`, shown in admin as **Allowed CRT** |
| Mentor | Same portal access as other admin users | `students.manage` for `/admin/crt/mentors` |

`/admin` is guarded by sign-in and portal access. A student who only has `crt.access` cannot open the admin CRT screens.

Student CRT routes are guarded by sign-in and `crt.access`. Allowed CRT is a label permission. It is not granted to every student account automatically.

The student must already be a member of the batch before the assignment is useful. Membership is managed at `/admin/batches/:batchId`, not on the CRT assignment screen.

A published path that is not assigned to one of the student's batches does not appear on `/crt`.

## 3. Test accounts and test-data preparation

Prepare these accounts before the script. Record only non-secret references in section 9 (for example a role label and an email local-part). Do not record passwords.

| Account | Needs |
| --- | --- |
| Content admin | Portal access and `crt.access` |
| Batch admin | Portal access and `batches.manage`. This can be the same person as the content admin when that person has both permissions |
| Student | Profile role `USER`, membership in the test batch, and the **Allowed CRT** label (`crt.access`) |
| Student without CRT | Optional negative check: a `USER` in the same batch with no `crt.access` |
| Mentor | Portal access and `students.manage` |

Create one empty test batch and confirm the student is a member of it before assigning a CRT path. Do not put an `ADMIN` profile in that batch if that profile will be used as the student under test. The mentor report excludes profiles whose role is `ADMIN`.

Suggested content for one pass:

- One learning path, published only after its modules and questions exist.
- At least one module.
- At least one question on that module, with a non-empty topic, four options, and one correct answer. Topic coverage needs a non-null topic.
- A saved mock blueprint whose question count for each module is not higher than the number of questions in that module.

## 4. Admin workflow

### 4.1 Create and publish a CRT path

Route: `/admin/crt/paths`

Screen: Learning Paths (`src/app/admin/crt/learning-paths/learning-paths.ts`). Writes go through `src/app/admin/services/crt-admin.service.ts`.

1. Sign in as the content admin and open `/admin/crt/paths`.
2. Choose **+ Create Path**.
3. Enter a title that identifies this QA run. Leave the path as **Draft** for the first save if you still need to add modules.
4. Save.
5. Edit the path and set Status to **Published**, then save again. Publishing is this status field. There is no separate Publish button on the path list.

Expected result: the path row shows status `published`. A draft path cannot be selected on the assignment screen. Students do not see the path yet, even after it is published, until section 4.4 is done.

### 4.2 Add modules and questions

Routes: `/admin/crt/paths/:pathId/modules` and `/admin/crt/questions`

Screens: `src/app/admin/crt/path-modules/path-modules.ts` and `src/app/admin/crt/questions/crt-questions.ts`. Same admin service.

1. Open the path's modules screen.
2. Add a module and save it.
3. Open `/admin/crt/questions`.
4. Choose **+ Add Question**. If no module exists, the screen reports that a module is required and does not open the form.
5. Select the module, enter the stem, options A–D, the correct answer, a topic, and a difficulty. Save.

Expected result: the question is listed under that module. It is stored with the module, not as a separate published flag. Students still cannot open the path until it is assigned.

### 4.3 Configure the mock blueprint

Route: `/admin/crt/paths/:pathId/modules` (same modules screen)

The mock block calls `crt_save_mock_blueprint`.

1. On the path modules screen, set the total duration in minutes.
2. Set the number of questions for the module. Keep that number less than or equal to the questions saved on the module.
3. Choose **Save Mock Configuration**.

Expected result: the configuration stays on the page after reload. This step does not by itself show a mock to the student. The student mock starts only after the path is published and assigned, and only if this blueprint can supply the requested questions.

### 4.4 Assign the path to a batch

Route: `/admin/crt/assignments`

Screen: `src/app/admin/crt/assignments/crt-assignments.ts`, using `src/app/admin/services/crt-path-assignments.service.ts`.

Permission: `batches.manage`.

1. Confirm the test student is already a member of the test batch (`/admin/batches/:batchId`).
2. Open `/admin/crt/assignments`.
3. Choose **Assign a path**.
4. Select the published path. Draft paths are not in the list.
5. Select the test batch and save.

Expected result: the assignments table shows the batch name, the path title, and the assigned time. The row is stored in `crt_path_assignments`. Unassign remains available if the run needs to be reversed.

## 5. Student workflow

Student routes require sign-in and `crt.access`.

### 5.1 Confirm batch membership and Allowed CRT

1. On the batch detail page, confirm the test student is a member.
2. On the staff label that is attached to the student, confirm **Allowed CRT** (`crt.access`).
3. Optional: sign in as the student who lacks Allowed CRT and open `/crt`. The feature guard should send that account away from CRT.

Expected result: the demo student can open `/crt`. The student without the label cannot. Membership alone is not enough, and Allowed CRT alone is not enough if the path is not assigned to the student's batch.

### 5.2 Open the assigned path

Routes: `/crt`, then `/crt/paths/:pathId/modules`

Screens: `src/app/crt/crt.ts` and `src/app/crt/modules/crt-modules.ts`. Path visibility comes from `src/app/crt/services/crt-practice.service.ts` under the assignment rules.

1. Sign in as the demo student.
2. Open `/crt`.
3. Find the published path card.
4. Choose **Continue**, or open the modules list for that path.

Expected result:

- The card shows the path title, **Readiness** as a score out of 100, and a module progress line (modules attempted divided by modules on the path). Progress and readiness are different numbers.
- Before any submission, readiness is 0 because every component in the formula is 0.
- **Continue** opens practice for an in-progress module, otherwise the next module that has not been attempted.
- The modules page lists **Start Practice** on each module and **Start Mock Test** for the path.
- If the path is published but not assigned to this student's batch, it is absent. The home empty state says that no path is assigned to the student's batch.

### 5.3 Complete and submit practice

Routes: `/crt/paths/:pathId/modules/:moduleId/practice`, then `/crt/paths/:pathId/modules/:moduleId/attempts/:attemptId/result`

Screens: `src/app/crt/practice/crt-practice.ts` and `src/app/crt/result/crt-result.ts`. Service: `src/app/crt/services/crt-practice.service.ts`. Submit calls `crt_submit_attempt`.

1. From the modules page, choose **Start Practice** for the module under test.
2. Select an answer for each question you intend to score. Each selection is saved on its own.
3. Choose submit, then confirm.

Expected result:

- The practice page shows an elapsed timer measured in the browser. There is no configured countdown and no automatic submit.
- After confirmation, the app opens the practice result route.
- The result page says the practice was submitted and shows the stored score, maximum score, and the duration recorded by the server at submit.
- The attempt is `kind = practice` and `status = submitted`.
- Leaving a question unanswered lowers the score. It does not block submit.
- This result page does not show the readiness score.

### 5.4 Complete and submit a mock test

Routes: `/crt/mock/:pathId`, then `/crt/mock/:pathId/attempts/:attemptId/result`

Screens: `src/app/crt/mock/crt-mock.ts` and `src/app/crt/mock-result/crt-mock-result.ts`. Service: `src/app/crt/services/crt-mock.service.ts`.

Start calls `crt_start_mock_attempt`. Questions come from `crt_get_mock_questions`. Submit calls `crt_submit_mock_attempt`.

1. Return to `/crt/paths/:pathId/modules`.
2. Choose **Start Mock Test**.
3. Answer the presented questions.
4. Submit before the countdown ends. If you are also checking the timer, let it expire instead and record that separately.

Expected result:

- The mock page shows a countdown based on the blueprint duration.
- When the countdown reaches zero, the page submits the test.
- A successful submit opens the mock result route and states that the mock was submitted, with the stored score.
- The attempt is `kind = mock` and `status = submitted`.
- Start fails when the blueprint was not saved, or when a section asks for more questions than the module contains. That failure is expected for a bad blueprint, not a pass of this step.
- The mock result page does not show readiness.

### 5.5 Return to CRT Home and verify readiness

Route: `/crt`

Readiness is defined in `docs/crt/readiness.md`. It is calculated when `/crt` loads. It is not stored in its own table or column. `crt_submit_attempt` and `crt_submit_mock_attempt` store `score` and `max_score` on `crt_attempts`. Opening `/crt` reads those rows and recalculates.

```text
Readiness Score = (0.40 × Practice Accuracy) + (0.40 × Latest Mock Score) + (0.20 × Topic Coverage)
```

The result is rounded to the nearest integer and kept within 0–100.

- Practice accuracy is the average of `score / max_score × 100` for the latest five submitted practice attempts on that path. Attempts with no usable `max_score` are skipped. No submitted practice means 0.
- Latest mock score is the accuracy of the newest submitted mock on that path. No submitted mock means 0.
- Topic coverage is the percentage of distinct non-null topics on the path's questions that the student has answered correctly at least once on a submitted practice or mock attempt. No eligible topics means 0.
- An empty component stays in the formula as 0. The other weights are not rescaled.
- In-progress attempts are ignored.

1. From the practice or mock result page, open `/crt` again. Use a full load of CRT Home, not the result page.
2. Read the readiness value on the path card.
3. Compare it with the formula using the scores just stored. For a first practice and a first mock, practice accuracy is that practice percentage, the mock component is that mock percentage, and topic coverage depends on whether a correct answer hit each distinct topic.

Expected result: the card shows the recalculated integer. Example from the readiness doc: practice accuracies averaging 80, a latest mock of 60, and topic coverage of 50 produce `(0.40 × 80) + (0.40 × 60) + (0.20 × 50) = 66`. A different set of answers must produce its own number. Do not treat 66 as the expected value for this run unless the scores match that example.

Company-pack submissions do not change this score.

## 6. Mentor workflow

Route: `/admin/crt/mentors`

Screen: `src/app/admin/crt/mentor-dashboard/crt-mentor-dashboard.ts`. Data comes from `crt_mentor_dashboard_report` through `src/app/admin/services/crt-mentor-dashboard.service.ts`.

The mentor score uses the same formula as section 5.5. It is computed when the report loads. Submitting as the student does not push a new value into an open mentor screen. Reload the dashboard after the student submission.

1. Sign in as the mentor and open `/admin/crt/mentors`.
2. Set Batch to the test batch, or leave **All batches**.
3. Set the path filter to the assigned path. If a batch is selected, the path list is the paths assigned to that batch.
4. Leave readiness-below and inactive-days empty unless you are checking those filters on purpose.
5. Choose **Apply**.
6. Find the demo student. The row is one student, one batch, and one path.

Expected result:

- Columns include student, email, batch, last submitted attempt, readiness out of 100, and active or inactive.
- Readiness matches the integer on the student's `/crt` card for that path, within the same submitted attempts.
- Last attempt is the latest submitted practice or mock time on that path, not an in-progress attempt and not a company-pack attempt.
- With the inactive-days filter empty, status uses a 7-day window. A submitted attempt inside that window is active. No submitted attempt is inactive.
- The report does not list individual answers, and it does not show the module-progress percentage from CRT Home.
- The report is not limited to one mentor's own students. It includes students in batches that have a published path assignment, except profiles with role `ADMIN`.
- A student who is not in the batch, or whose path is not assigned, has no row for that path.

## 7. Expected results for each step

| Step | Pass looks like |
| --- | --- |
| 4.1 Create and publish | Path exists and its status is `published`. Draft paths stay out of the assignment picker. |
| 4.2 Modules and questions | The module is on the path. The question is saved on that module with a topic and a correct option. |
| 4.3 Mock blueprint | Save Mock Configuration succeeds. The duration and per-module counts are still there after reload. |
| 4.4 Assignment | The assignments table shows that batch and published path. |
| 5.1 Access | Demo student can open `/crt`. A student without Allowed CRT cannot. The demo student is a member of the batch. |
| 5.2 Open path | The assigned published path is on `/crt` with readiness `0/100` before any submission. An unassigned published path is not listed. |
| 5.3 Practice | Result page shows a submitted practice score. The page has no countdown. |
| 5.4 Mock | Mock starts only with a valid blueprint, shows a countdown, and the result page shows a submitted mock score. |
| 5.5 Readiness | Reloading `/crt` shows the formula result. The result pages do not show readiness. |
| 6 Mentor | After Apply on a freshly loaded `/admin/crt/mentors`, the student row shows the same readiness and the last submitted attempt. |

## 8. QA execution checklist

Do not check an item until that step has been run and the evidence in section 9 is filled in. All items start unchecked.

### Admin

- [ ] Content admin can open `/admin/crt/paths`.
- [ ] A path can be created as draft.
- [ ] The path status can be set to published.
- [ ] A module can be added on `/admin/crt/paths/:pathId/modules`.
- [ ] A question can be added on `/admin/crt/questions` only after a module exists.
- [ ] Mock configuration saves on the modules screen.
- [ ] A blueprint that asks for more questions than the module contains is not used for the successful mock run.
- [ ] The student is a member of the test batch before assignment.
- [ ] `/admin/crt/assignments` lists only published paths.
- [ ] The published path is assigned to the test batch.

### Student

- [ ] The demo student has Allowed CRT (`crt.access`).
- [ ] A student without Allowed CRT cannot use `/crt`.
- [ ] `/crt` shows the assigned published path.
- [ ] `/crt` does not show a published path that is not assigned to the student's batch.
- [ ] Readiness is `0/100` before any submitted practice or mock.
- [ ] Start Practice opens `/crt/paths/:pathId/modules/:moduleId/practice`.
- [ ] The practice page has an elapsed timer and no configured countdown.
- [ ] Confirming submit opens the practice result route and shows the stored score.
- [ ] Start Mock Test opens `/crt/mock/:pathId`.
- [ ] The mock page shows a countdown.
- [ ] Submitting the mock opens the mock result route and shows the stored score.
- [ ] Opening `/crt` again shows a recalculated readiness score.
- [ ] That score matches the readiness formula for the stored attempts.

### Mentor

- [ ] Mentor can open `/admin/crt/mentors`.
- [ ] Filtering by the test batch and assigned path, then Apply, shows the demo student.
- [ ] The readiness value matches the student's CRT Home score for that path.
- [ ] Last attempt matches the latest submitted practice or mock, not a company pack.
- [ ] The dashboard was loaded or Apply was used after the student submitted. An already open report was not assumed to update by itself.

## 9. Evidence

Fill this in during the run. Leave it blank until then. Do not mark section 8 from memory.

| Field | Record |
| --- | --- |
| Date | |
| Tester | |
| Environment | Non-production project name only. No URLs that contain keys. |
| Content admin reference | |
| Batch admin reference | |
| Student reference | |
| Mentor reference | |
| Test batch name | |
| Path title | |
| Module title | |
| Practice score / max | |
| Mock score / max | |
| Readiness on `/crt` | |
| Readiness on mentor row | |
| Last attempt shown to mentor | |

Screenshots (store the files outside the repo or in the team's agreed evidence folder; link or name them here):

| # | What it shows | File |
| --- | --- | --- |
| 1 | Published path | |
| 2 | Saved question | |
| 3 | Saved mock configuration | |
| 4 | Assignment row | |
| 5 | Student path card before any attempt | |
| 6 | Practice result | |
| 7 | Mock result, including the timer if it was part of the run | |
| 8 | CRT Home readiness after reload | |
| 9 | Mentor row after Apply | |

Observed results:

| Step | Observed | Pass or fail |
| --- | --- | --- |
| 4.1 | | |
| 4.2 | | |
| 4.3 | | |
| 4.4 | | |
| 5.1 | | |
| 5.2 | | |
| 5.3 | | |
| 5.4 | | |
| 5.5 | | |
| 6 | | |

## 10. Known gaps and limitations

These are properties of the current implementation, not failed test steps.

- `docs/crt/wireframes.md` calls the practice screen a timed practice and shows review and retry branches. The implemented practice page has no configured countdown. Elapsed time is measured in the browser, and the server stores duration at submit. This demo does not require a practice countdown.
- Readiness is not written when the student submits. The practice result page and the mock result page do not show it. The student must open `/crt` again. The mentor must reload `/admin/crt/mentors` or choose Apply again.
- CRT Home "Progress" is the share of modules that have an attempt. The mentor table does not show that percentage. It shows readiness, the last submitted attempt, and active or inactive.
- The mentor report is organization-wide for staff with `students.manage`. It is not scoped to a mentor's personal students. Profiles with role `ADMIN` are omitted even if they belong to a batch.
- With the inactive-days filter left empty, active means a submitted attempt in the last 7 days.
- Company packs are a separate flow. Their scores do not change readiness and do not appear as the mentor last attempt.
- Knowing a path URL is not enough. Creating a practice attempt still depends on the path being published and assigned to a batch the student belongs to.
- A mock cannot start until **Save Mock Configuration** has produced a blueprint that the modules can fill.

## 11. Final QA sign-off

This sign-off is unsigned until section 8 is complete and section 9 has the evidence. Do not sign from the document alone.

| Role | Name | Date | Result |
| --- | --- | --- | --- |
| Tester | | | Not run |
| Reviewer | | | Not run |

Notes:

```text
No CRT-018 execution has been recorded in this file.
```
