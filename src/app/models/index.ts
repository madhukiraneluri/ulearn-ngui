// ─── USER & AUTH ─────────────────────────────────────────────────────────────

export type UserRole = 'USER' | 'ADMIN';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

// ─── COURSES ─────────────────────────────────────────────────────────────────

export type CourseCategory = 'technical' | 'creative' | 'business';
export type CourseStatus = 'draft' | 'published' | 'archived';

export interface CurriculumLesson {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  videoUrl?: string;
  resourceUrl?: string;
  resourceType?: 'video' | 'file';
  isFree: boolean;
  order: number;
}

export type ContentBlockType =
  | 'heading'
  | 'text'
  | 'image'
  | 'two_column'
  | 'callout'
  | 'code'
  | 'quote'
  | 'divider'
  | 'gallery'
  | 'video';

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  orderIndex: number;
  content: Record<string, unknown>;
}

export interface LessonWithBlocks extends CurriculumLesson {
  contentBlocks: ContentBlock[];
  moduleId: string;
  moduleOrder: number;
}

export interface LessonProgress {
  lessonId: string;
  completed: boolean;
  completedAt?: string;
}

export interface CurriculumModule {
  id: string;
  title: string;
  description: string;
  order: number;
  lessons: CurriculumLesson[];
}

export interface Mentor {
  id: string;
  name: string;
  role: string;
  company: string;
  bio: string;
  avatarUrl?: string;
  linkedInUrl?: string;
}

export type CourseFormat = '45-day' | '3-month';

export interface Course {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: CourseCategory;
  status: CourseStatus;
  thumbnailUrl?: string;
  price: number;
  originalPrice: number;
  durationMonths: number;
  durationDays?: number;
  weeklyHours?: number;
  liveClassCount?: number;
  courseFormat?: CourseFormat;
  totalLessons: number;
  rating: number;
  totalStudents: number;
  curriculum: CurriculumModule[];
  mentors: Mentor[];
  isResearchCourse: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CourseListItem {
  id: string;
  slug: string;
  title: string;
  category: CourseCategory;
  status: CourseStatus;
  thumbnailUrl?: string;
  price: number;
  originalPrice: number;
  durationMonths: number;
  durationDays?: number;
  weeklyHours?: number;
  liveClassCount?: number;
  courseFormat?: CourseFormat;
  totalLessons: number;
  rating: number;
  totalStudents: number;
  isResearchCourse: boolean;
}

// ─── INTERNSHIPS ─────────────────────────────────────────────────────────────

export type InternshipType = 'short' | 'long';
export type InternshipMode = 'remote' | 'hybrid' | 'onsite';

export interface Internship {
  id: string;
  title: string;
  type: InternshipType;
  mode: InternshipMode;
  domain: string;
  description: string;
  durationLabel: string;
  stipendPerMonth: number;
  hasPPO: boolean;
  skills: string[];
  thumbnailUrl?: string;
  status: 'open' | 'closed';
  createdAt: string;
}

// ─── RESEARCH PAPERS ─────────────────────────────────────────────────────────

export type PaperStatus = 'published' | 'under_review' | 'preprint';
export type PaperCategory = 'ai' | 'nlp' | 'cv' | 'health' | 'business';

export interface ResearchPaper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  category: PaperCategory;
  status: PaperStatus;
  venue: string;
  year: number;
  pdfUrl?: string;
  doiUrl?: string;
  citations: number;
  thumbnailUrl?: string;
  createdAt: string;
}

// ─── ALBUMS ──────────────────────────────────────────────────────────────────

export interface AlbumImage {
  id: string;
  url: string;
  caption?: string;
  order: number;
}

export interface Album {
  id: string;
  title: string;
  description?: string;
  coverImageUrl?: string;
  images: AlbumImage[];
  eventDate?: string;
  createdAt: string;
}

// ─── STUDENTS ────────────────────────────────────────────────────────────────

export type EnrollmentStatus = 'active' | 'completed' | 'refunded';

export interface Enrollment {
  id: string;
  courseId: string;
  courseTitle: string;
  enrolledAt: string;
  status: EnrollmentStatus;
  progressPercent: number;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  enrollments: Enrollment[];
  totalReferrals: number;
  referralEarnings: number;
  joinedAt: string;
}

// ─── REFERRAL ────────────────────────────────────────────────────────────────

export interface Referral {
  id: string;
  referrerUserId: string;
  referredEmail: string;
  courseId: string;
  courseTitle: string;
  status: 'pending' | 'converted' | 'paid';
  earnedAmount: number;
  createdAt: string;
}

// ─── SHARED ───────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  status: number;
  message: string;
  errors?: Record<string, string[]>;
}

export interface SelectOption<T = string> {
  label: string;
  value: T;
}

export interface UploadResponse {
  key: string;
  url: string;
}

export interface DashboardStats {
  totalStudents: number;
  totalCourses: number;
  totalRevenue: number;
  totalEnrollmentsThisMonth: number;
  totalPapersPublished: number;
  activeInternships: number;
  pendingReferrals: number;
  newStudentsThisWeek: number;
}