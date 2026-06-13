export type CurriculumBulkImportMode = 'replace' | 'append';

export interface BulkLessonInput {
  order: number;
  title: string;
  durationMinutes: number;
  isFree: boolean;
}

export interface BulkModuleInput {
  order: number;
  title: string;
  lessons: BulkLessonInput[];
}

export interface CurriculumBulkPayload {
  modules: BulkModuleInput[];
}

export interface CurriculumBulkImportResult {
  path: string;
  title: string;
  success: boolean;
  message: string;
}

/** Shown in the editor — replace Module__Title / Lesson__Title with real names. */
export const BULK_CURRICULUM_PLACEHOLDER =
  '{Module:1, Module__Title, {Lesson:1, Lesson__Title}, {Lesson:2, Lesson__Title}}\n' +
  '{Module:2, Module__Title, {Lesson:1, Lesson__Title}, {Lesson:2, Lesson__Title}}';

export const BULK_FORMAT_EXAMPLE =
  '{Module:1, Module__Title, {Lesson:1, Lesson__Title}, {Lesson:2, Lesson__Title}}';

/** Filled example (intro-to-ml style) for download / load sample. */
export const BULK_CURRICULUM_SAMPLE =
  '{Module:1, Module 1, {Lesson:1, What is Machine Learning?}, {Lesson:2, Python for Data Science}, {Lesson:3, Data Visualization}}\n' +
  '{Module:2, Module 2, {Lesson:1, Linear Regression}, {Lesson:2, Classification Basics}}';

export const BULK_FORMAT_HELP = [
  'One module per line.',
  'Module: {Module:N, ModuleTitle, {Lesson:N, LessonTitle}, ...}',
  'Lesson: {Lesson:N, LessonTitle} — N is order within that module.',
  'First lesson of Module 1 is marked free preview automatically.',
  'All lessons default to 120 minutes duration.',
  'Do not use commas inside titles.'
];

const MODULE_RE =
  /\{\s*Module\s*:\s*(\d+)\s*,\s*([^,{]+?)\s*,\s*((?:\{\s*Lesson\s*:[^}]+\}\s*,?\s*)+)\}/gi;

const LESSON_RE = /\{\s*Lesson\s*:\s*(\d+)\s*,\s*([^}]+?)\s*\}/gi;

export function parseCurriculumBulkText(raw: string): {
  payload: CurriculumBulkPayload | null;
  error?: string;
} {
  const text = raw.trim();
  if (!text) {
    return { payload: null, error: 'Paste your module/lesson list.' };
  }

  const modules: BulkModuleInput[] = [];
  let moduleMatch: RegExpExecArray | null;
  MODULE_RE.lastIndex = 0;

  while ((moduleMatch = MODULE_RE.exec(text)) !== null) {
    const order = Number(moduleMatch[1]);
    const title = moduleMatch[2].trim();
    const lessonsChunk = moduleMatch[3];

    if (!title || title === 'Module__Title') {
      return {
        payload: null,
        error: `Module ${order}: replace Module__Title with a real module name.`
      };
    }

    const lessons: BulkLessonInput[] = [];
    let lessonMatch: RegExpExecArray | null;
    LESSON_RE.lastIndex = 0;

    while ((lessonMatch = LESSON_RE.exec(lessonsChunk)) !== null) {
      const lesOrder = Number(lessonMatch[1]);
      const lesTitle = lessonMatch[2].trim();

      if (!lesTitle || lesTitle === 'Lesson__Title') {
        return {
          payload: null,
          error: `Module "${title}", Lesson ${lesOrder}: replace Lesson__Title with a real lesson name.`
        };
      }

      lessons.push({
        order: lesOrder,
        title: lesTitle,
        durationMinutes: 120,
        isFree: order === 1 && lesOrder === 1
      });
    }

    if (lessons.length === 0) {
      return {
        payload: null,
        error: `Module "${title}": add at least one {Lesson:N, Title} entry.`
      };
    }

    lessons.sort((a, b) => a.order - b.order);
    modules.push({ order, title, lessons });
  }

  if (modules.length === 0) {
    return {
      payload: null,
      error:
        'No modules found. Use format: {Module:1, Title, {Lesson:1, Lesson Title}, {Lesson:2, Another}}'
    };
  }

  modules.sort((a, b) => a.order - b.order);
  return { payload: { modules } };
}

export function downloadSampleCurriculumText(
  content: string,
  filename = 'ulearn-curriculum-bulk-sample.txt'
): void {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
