import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { CourseListItem, Course, CurriculumModule, Mentor } from '../../models';

const MOCK_COURSES: CourseListItem[] = [
  {
    id: '1', slug: 'full-stack-web-development',
    title: 'Full Stack Web Development',
    category: 'technical', status: 'published',
    price: 12999, originalPrice: 24999,
    durationMonths: 6, totalLessons: 120,
    rating: 4.9, totalStudents: 2400,
    isResearchCourse: false,
  },
  {
    id: '2', slug: 'ui-ux-design-mastery',
    title: 'UI/UX Design Mastery',
    category: 'creative', status: 'published',
    price: 9999, originalPrice: 18999,
    durationMonths: 4, totalLessons: 80,
    rating: 4.8, totalStudents: 1800,
    isResearchCourse: false,
  },
  {
    id: '3', slug: 'digital-marketing-growth',
    title: 'Digital Marketing & Growth',
    category: 'business', status: 'published',
    price: 7999, originalPrice: 14999,
    durationMonths: 3, totalLessons: 60,
    rating: 4.7, totalStudents: 1200,
    isResearchCourse: false,
  },
  {
    id: '4', slug: 'ai-ml-research',
    title: 'AI & Machine Learning Research',
    category: 'technical', status: 'published',
    price: 24999, originalPrice: 44999,
    durationMonths: 6, totalLessons: 90,
    rating: 4.9, totalStudents: 600,
    isResearchCourse: true,
  },
  {
    id: '5', slug: 'business-research',
    title: 'Business & Management Research',
    category: 'business', status: 'published',
    price: 18999, originalPrice: 34999,
    durationMonths: 5, totalLessons: 70,
    rating: 4.8, totalStudents: 400,
    isResearchCourse: true,
  },
  {
    id: '6', slug: 'react-native-mobile',
    title: 'React Native Mobile Development',
    category: 'technical', status: 'published',
    price: 11999, originalPrice: 21999,
    durationMonths: 4, totalLessons: 100,
    rating: 4.7, totalStudents: 900,
    isResearchCourse: false,
  },
  {
    id: '7', slug: 'graphic-design-branding',
    title: 'Graphic Design & Branding',
    category: 'creative', status: 'published',
    price: 8999, originalPrice: 16999,
    durationMonths: 3, totalLessons: 65,
    rating: 4.6, totalStudents: 750,
    isResearchCourse: false,
  },
  {
    id: '8', slug: 'business-analytics',
    title: 'Business Analytics & Strategy',
    category: 'business', status: 'published',
    price: 13999, originalPrice: 25999,
    durationMonths: 5, totalLessons: 85,
    rating: 4.8, totalStudents: 500,
    isResearchCourse: false,
  },
];

const MOCK_COURSE_DETAIL: Record<string, Course> = {
  'full-stack-web-development': {
    id: '1', slug: 'full-stack-web-development',
    title: 'Full Stack Web Development',
    description: 'Master the complete web development stack — React and Angular on the frontend, Spring Boot and Node.js on the backend, plus cloud deployment on AWS.',
    category: 'technical', status: 'published',
    price: 12999, originalPrice: 24999,
    durationMonths: 6, totalLessons: 120,
    rating: 4.9, totalStudents: 2400,
    isResearchCourse: false,
    createdAt: '2024-01-01', updatedAt: '2024-06-01',
    curriculum: [
      {
        id: 'm1', title: 'HTML, CSS & JavaScript Fundamentals',
        description: 'Building blocks of the web', order: 1,
        lessons: [
          { id: 'l1', title: 'Intro to HTML', description: '', durationMinutes: 45, isFree: true, order: 1 },
          { id: 'l2', title: 'CSS Layouts', description: '', durationMinutes: 60, isFree: true, order: 2 },
          { id: 'l3', title: 'JavaScript Basics', description: '', durationMinutes: 90, isFree: false, order: 3 },
        ]
      },
      {
        id: 'm2', title: 'React & Component Architecture',
        description: 'Modern frontend development', order: 2,
        lessons: [
          { id: 'l4', title: 'React Fundamentals', description: '', durationMinutes: 75, isFree: false, order: 1 },
          { id: 'l5', title: 'State Management', description: '', durationMinutes: 90, isFree: false, order: 2 },
        ]
      },
      {
        id: 'm3', title: 'Spring Boot REST APIs',
        description: 'Backend development with Java', order: 3,
        lessons: [
          { id: 'l6', title: 'Spring Boot Setup', description: '', durationMinutes: 60, isFree: false, order: 1 },
          { id: 'l7', title: 'REST Controllers', description: '', durationMinutes: 75, isFree: false, order: 2 },
        ]
      },
    ],
    mentors: [
      {
        id: 'men1', name: 'Anil Kumar',
        role: 'Senior Engineer', company: 'Infosys',
        bio: 'Full stack veteran with 10 years of experience in Java microservices and React. Has mentored 500+ students.',
      },
      {
        id: 'men2', name: 'Divya Menon',
        role: 'Tech Lead', company: 'Freshworks',
        bio: 'Frontend specialist and speaker at ReactConf India 2023. Passionate about clean, accessible UI.',
      },
    ],
  },
  'ui-ux-design-mastery': {
    id: '2', slug: 'ui-ux-design-mastery',
    title: 'UI/UX Design Mastery',
    description: 'Learn design thinking, Figma, prototyping, user research, and build a portfolio of 5 real-world projects that impress hiring managers.',
    category: 'creative', status: 'published',
    price: 9999, originalPrice: 18999,
    durationMonths: 4, totalLessons: 80,
    rating: 4.8, totalStudents: 1800,
    isResearchCourse: false,
    createdAt: '2024-01-01', updatedAt: '2024-06-01',
    curriculum: [
      {
        id: 'm1', title: 'Design Thinking & UX Fundamentals',
        description: 'Empathize, define, ideate', order: 1,
        lessons: [
          { id: 'l1', title: 'What is UX?', description: '', durationMinutes: 45, isFree: true, order: 1 },
          { id: 'l2', title: 'Design Thinking Process', description: '', durationMinutes: 60, isFree: false, order: 2 },
        ]
      },
      {
        id: 'm2', title: 'Figma Mastery',
        description: 'Components, auto-layout, prototypes', order: 2,
        lessons: [
          { id: 'l3', title: 'Figma Basics', description: '', durationMinutes: 75, isFree: false, order: 1 },
          { id: 'l4', title: 'Auto Layout', description: '', durationMinutes: 60, isFree: false, order: 2 },
        ]
      },
    ],
    mentors: [
      {
        id: 'men1', name: 'Sneha Krishnan',
        role: 'Product Designer', company: 'Swiggy',
        bio: 'Designed flows used by 10M+ users. Teaches human-centred design with real case studies.',
      },
    ],
  },
  'ai-ml-research': {
    id: '4', slug: 'ai-ml-research',
    title: 'AI & Machine Learning Research',
    description: 'A rigorous 6-month research programme. Publish papers, build original models, and get mentored by IIT researchers.',
    category: 'technical', status: 'published',
    price: 24999, originalPrice: 44999,
    durationMonths: 6, totalLessons: 90,
    rating: 4.9, totalStudents: 600,
    isResearchCourse: true,
    createdAt: '2024-01-01', updatedAt: '2024-06-01',
    curriculum: [
      {
        id: 'm1', title: 'Mathematical Foundations for ML',
        description: 'Linear algebra, probability, calculus', order: 1,
        lessons: [
          { id: 'l1', title: 'Linear Algebra Refresher', description: '', durationMinutes: 90, isFree: true, order: 1 },
          { id: 'l2', title: 'Probability Theory', description: '', durationMinutes: 75, isFree: false, order: 2 },
        ]
      },
      {
        id: 'm2', title: 'Deep Learning & Neural Networks',
        description: 'CNNs, RNNs, Transformers', order: 2,
        lessons: [
          { id: 'l3', title: 'Neural Network Basics', description: '', durationMinutes: 90, isFree: false, order: 1 },
          { id: 'l4', title: 'Transformer Architecture', description: '', durationMinutes: 120, isFree: false, order: 2 },
        ]
      },
    ],
    mentors: [
      {
        id: 'men1', name: 'Dr. Sreejith P.',
        role: 'AI Research Lab', company: 'IIT Madras',
        bio: 'Published 18 papers in top-tier venues. Specialises in NLP and multi-modal learning.',
      },
      {
        id: 'men2', name: 'Meera Iyer',
        role: 'ML Engineer', company: 'Google DeepMind',
        bio: 'Works on large-scale ML systems. Mentors students on research methodology and paper writing.',
      },
    ],
  },
};

@Injectable({ providedIn: 'root' })
export class CourseService {
  // ── List ───────────────────────────────────────────────────────────────────
  // SWAP LATER: return this.http.get<CourseListItem[]>(`${env.apiUrl}/courses`);
  getCourses(): Observable<CourseListItem[]> {
    return of(MOCK_COURSES);
  }

  // ── Detail ─────────────────────────────────────────────────────────────────
  // SWAP LATER: return this.http.get<Course>(`${env.apiUrl}/courses/${slug}`);
  getCourseBySlug(slug: string): Observable<Course | null> {
    return of(MOCK_COURSE_DETAIL[slug] ?? null);
  }

  // ── Featured (for home page) ───────────────────────────────────────────────
  // SWAP LATER: return this.http.get<CourseListItem[]>(`${env.apiUrl}/courses/featured`);
  getFeaturedCourses(): Observable<CourseListItem[]> {
    return of(MOCK_COURSES.slice(0, 3));
  }
}