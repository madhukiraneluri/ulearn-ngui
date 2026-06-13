import { CourseCategory, CourseFormat, CourseStatus } from '../../models';
import { AdminCourseInput } from './admin-course.service';

export interface BulkColumnDef {
  key: string;
  header: string;
  required: boolean;
  defaultValue: string;
  example: string;
  description: string;
}

export const BULK_COURSE_COLUMNS: BulkColumnDef[] = [
  {
    key: 'title',
    header: 'title',
    required: true,
    defaultValue: '— (row skipped if empty)',
    example: 'Intro to Machine Learning',
    description:
      'Display name shown on the course page and catalog. This is the only required column — every row must have a title.'
  },
  {
    key: 'slug',
    header: 'slug',
    required: false,
    defaultValue: 'Auto-generated from title (e.g. intro-to-ml)',
    example: 'intro-to-ml',
    description:
      'URL path segment. Lowercase letters, numbers, and hyphens only. Used in links like /courses/intro-to-ml. Must be unique across all courses.'
  },
  {
    key: 'description',
    header: 'description',
    required: false,
    defaultValue: 'Course description coming soon.',
    example:
      'A 45-day intensive program with 22 classes. Learn ML foundations through hands-on sessions with mentor guidance.',
    description: 'Long text shown in the course hero and about section on the public course page.'
  },
  {
    key: 'category',
    header: 'category',
    required: false,
    defaultValue: 'technical',
    example: 'technical',
    description:
      'Course category badge. Allowed values: technical, creative, business (lowercase).'
  },
  {
    key: 'status',
    header: 'status',
    required: false,
    defaultValue: 'draft',
    example: 'published',
    description:
      'Visibility on the public site. draft = admin only, published = visible to everyone, archived = hidden from catalog.'
  },
  {
    key: 'price',
    header: 'price',
    required: false,
    defaultValue: '0',
    example: '199.99',
    description: 'Current selling price in INR (₹). Use 0 for free courses.'
  },
  {
    key: 'original_price',
    header: 'original_price',
    required: false,
    defaultValue: '0',
    example: '299.99',
    description: 'Strikethrough “was” price shown next to the discounted price. Usually higher than price.'
  },
  {
    key: 'duration_months',
    header: 'duration_months',
    required: false,
    defaultValue: '1',
    example: '2',
    description: 'Course length in months (used when course_format is 3-month or for generic duration labels).'
  },
  {
    key: 'duration_days',
    header: 'duration_days',
    required: false,
    defaultValue: '(empty)',
    example: '45',
    description: 'Total program length in days. Use for 45-day bootcamp-style courses (course_format: 45-day).'
  },
  {
    key: 'weekly_hours',
    header: 'weekly_hours',
    required: false,
    defaultValue: '(empty)',
    example: '12',
    description: 'Hours per week commitment. Typically used with 3-month course_format.'
  },
  {
    key: 'class_count',
    header: 'class_count',
    required: false,
    defaultValue: '0',
    example: '22',
    description:
      'Number of class sessions in the course. Shown on the site as “22 classes · 2 hrs each”. Stored as live_class_count in the database.'
  },
  {
    key: 'hours_per_class',
    header: 'hours_per_class',
    required: false,
    defaultValue: '2',
    example: '2',
    description: 'Duration of each class in hours. Can be a decimal (e.g. 1.5 for 90 minutes).'
  },
  {
    key: 'course_format',
    header: 'course_format',
    required: false,
    defaultValue: '(empty)',
    example: '45-day',
    description:
      'Program type label. Allowed: 45-day or 3-month. Leave empty if not applicable.'
  },
  {
    key: 'total_lessons',
    header: 'total_lessons',
    required: false,
    defaultValue: 'Same as class_count, or 0',
    example: '22',
    description:
      'Total lesson/class count used for progress and metadata. Usually matches class_count.'
  },
  {
    key: 'rating',
    header: 'rating',
    required: false,
    defaultValue: '4.5',
    example: '4.6',
    description: 'Star rating displayed on the course card (0–5, one decimal allowed).'
  },
  {
    key: 'is_research_course',
    header: 'is_research_course',
    required: false,
    defaultValue: 'false',
    example: 'false',
    description:
      'Shows a “Research” badge on the course card. Accepts: true, false, yes, no, 1, 0.'
  },
  {
    key: 'thumbnail_url',
    header: 'thumbnail_url',
    required: false,
    defaultValue: '(empty)',
    example: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800',
    description: 'Full URL to the course cover image. Leave empty to use the category emoji placeholder.'
  }
];

export const SAMPLE_COURSE_ROW: Record<string, string | number | boolean> = {
  title: 'Intro to Machine Learning',
  slug: 'intro-to-ml',
  description:
    'A 45-day intensive program with 22 classes. Learn ML foundations through hands-on sessions with mentor guidance.',
  category: 'technical',
  status: 'published',
  price: 199.99,
  original_price: 299.99,
  duration_months: 2,
  duration_days: 45,
  weekly_hours: '',
  class_count: 22,
  hours_per_class: 2,
  course_format: '45-day',
  total_lessons: 22,
  rating: 4.6,
  is_research_course: false,
  thumbnail_url: ''
};

export interface BulkImportRowResult {
  rowNumber: number;
  title: string;
  success: boolean;
  message: string;
}

function parseBool(value: unknown): boolean {
  if (value === true || value === 1) return true;
  const s = String(value ?? '')
    .trim()
    .toLowerCase();
  return s === 'true' || s === 'yes' || s === '1';
}

function parseNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeCategory(raw: string): CourseCategory {
  const s = raw.trim().toLowerCase();
  if (s === 'creative' || s === 'business') return s;
  return 'technical';
}

function normalizeStatus(raw: string): CourseStatus {
  const s = raw.trim().toLowerCase();
  if (s === 'published' || s === 'archived') return s;
  return 'draft';
}

function normalizeFormat(raw: string): CourseFormat | undefined {
  const s = raw.trim().toLowerCase();
  if (s === '45-day' || s === '3-month') return s;
  return undefined;
}

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function rowToCourseInput(
  raw: Record<string, unknown>,
  rowNumber: number
): { input: AdminCourseInput | null; error?: string } {
  const title = String(raw['title'] ?? raw['Title'] ?? '').trim();
  if (!title) {
    return { input: null, error: `Row ${rowNumber}: title is required` };
  }

  const slugRaw = String(raw['slug'] ?? raw['Slug'] ?? '').trim();
  const slug = slugRaw || slugifyTitle(title);
  if (!slug) {
    return { input: null, error: `Row ${rowNumber}: could not derive slug from title` };
  }

  const classCount = parseNumber(raw['class_count']) ?? 0;
  const totalLessons = parseNumber(raw['total_lessons']) ?? classCount;

  const durationDays = parseNumber(raw['duration_days']);
  const weeklyHours = parseNumber(raw['weekly_hours']);

  const input: AdminCourseInput = {
    title,
    slug,
    description:
      String(raw['description'] ?? '').trim() || 'Course description coming soon.',
    category: normalizeCategory(String(raw['category'] ?? 'technical')),
    status: normalizeStatus(String(raw['status'] ?? 'draft')),
    price: parseNumber(raw['price']) ?? 0,
    originalPrice: parseNumber(raw['original_price']) ?? 0,
    durationMonths: parseNumber(raw['duration_months']) ?? 1,
    ...(durationDays !== undefined ? { durationDays } : {}),
    ...(weeklyHours !== undefined ? { weeklyHours } : {}),
    classCount: classCount || undefined,
    hoursPerClass: parseNumber(raw['hours_per_class']) ?? 2,
    courseFormat: normalizeFormat(String(raw['course_format'] ?? '')),
    totalLessons,
    rating: parseNumber(raw['rating']) ?? 4.5,
    isResearchCourse: parseBool(raw['is_research_course']),
    thumbnailUrl: String(raw['thumbnail_url'] ?? '').trim() || undefined
  };

  return { input };
}

export function getBulkHeaders(): string[] {
  return BULK_COURSE_COLUMNS.map((c) => c.header);
}
