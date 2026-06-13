export interface ClassHoursInput {
  classCount?: number;
  hoursPerClass?: number;
  totalLessons?: number;
}

export function resolveClassCount(input: ClassHoursInput): number {
  return input.classCount ?? input.totalLessons ?? 0;
}

export function formatHoursPerClass(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** e.g. "22 classes · 2 hrs each" */
export function formatClassHours(input: ClassHoursInput): string {
  const count = resolveClassCount(input);
  const countLabel = `${count} ${count === 1 ? 'class' : 'classes'}`;

  if (input.hoursPerClass != null && input.hoursPerClass > 0) {
    return `${countLabel} · ${formatHoursPerClass(input.hoursPerClass)} hrs each`;
  }

  return countLabel;
}

/** e.g. "3 classes · 1h 30m total" for a curriculum module */
export function formatModuleClasses(
  lessonCount: number,
  totalMinutes: number,
  hoursPerClass?: number
): string {
  const countLabel = `${lessonCount} ${lessonCount === 1 ? 'class' : 'classes'}`;

  if (hoursPerClass != null && hoursPerClass > 0) {
    return `${countLabel} · ${formatHoursPerClass(hoursPerClass)} hrs each`;
  }

  if (totalMinutes < 60) {
    return `${countLabel} · ${totalMinutes}m total`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const duration = mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return `${countLabel} · ${duration} total`;
}

function stripTopicPrefix(title: string): string {
  return title
    .replace(/^week\s*\d+\s*[:\-–—]?\s*/i, '')
    .replace(/^module\s*\d+\s*[:\-–—]?\s*/i, '')
    .replace(/^(?:live\s*)?class\s*\d+\s*[:\-–—]?\s*/i, '')
    .trim();
}

/** e.g. "Module 1: Introduction to ML" */
export function formatModuleTitle(order: number, title: string): string {
  const topic = stripTopicPrefix(title);
  return topic ? `Module ${order}: ${topic}` : `Module ${order}`;
}

/** Topic name only — strips Week/Module/Class prefixes from stored titles */
export function formatLessonTitle(title: string): string {
  const cleaned = stripTopicPrefix(title);
  return cleaned || title;
}
