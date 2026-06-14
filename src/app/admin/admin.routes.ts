import { Routes } from '@angular/router';

export const adminRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./admin-layout/admin-layout').then(m => m.AdminLayout),
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./dashboard/dashboard').then(m => m.Dashboard)
      },
      {
        path: 'courses',
        loadComponent: () =>
          import('./courses-management/courses-management').then(m => m.CoursesManagement)
      },
      {
        path: 'curriculum',
        loadComponent: () =>
          import('./curriculum-builder/curriculum-builder').then(m => m.CurriculumBuilder)
      },
      {
        path: 'curriculum/lesson/:lessonId',
        loadComponent: () =>
          import('./lesson-content-editor/lesson-content-editor').then(m => m.LessonContentEditor)
      },
      {
        path: 'mentors',
        loadComponent: () =>
          import('./mentors-management/mentors-management').then(m => m.MentorsManagement)
      },
      {
        path: 'internships',
        loadComponent: () =>
          import('./internships-management/internships-management').then(m => m.InternshipsManagement)
      },
      {
        path: 'internship-applications',
        loadComponent: () =>
          import('./internship-applications-management/internship-applications-management').then(
            m => m.InternshipApplicationsManagement
          )
      },
      {
        path: 'papers',
        loadComponent: () =>
          import('./papers-management/papers-management').then(m => m.PapersManagement)
      },
      {
        path: 'student-stories',
        loadComponent: () =>
          import('./student-stories-management/student-stories-management').then(
            m => m.StudentStoriesManagement
          )
      },
      {
        path: 'blogs',
        loadComponent: () =>
          import('./blogs-management/blogs-management').then(m => m.BlogsManagement)
      },
      {
        path: 'albums',
        redirectTo: 'blogs',
        pathMatch: 'full'
      },
      {
        path: 'students',
        loadComponent: () =>
          import('./students/students').then(m => m.Students)
      },
      {
        path: 'enrollments',
        loadComponent: () =>
          import('./enrollments-management/enrollments-management').then(m => m.EnrollmentsManagement)
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./settings/settings').then(m => m.Settings)
      },
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      }
    ]
  }
];
