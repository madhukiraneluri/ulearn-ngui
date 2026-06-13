import { Routes } from '@angular/router';

export const adminRoutes: Routes = [
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
    path: 'mentors',
    loadComponent: () =>
      import('./mentors-management/mentors-management').then(m => m.MentorsManagement)
  },
  {
    path: 'papers',
    loadComponent: () =>
      import('./papers-management/papers-management').then(m => m.PapersManagement)
  },
  {
    path: 'albums',
    loadComponent: () =>
      import('./albums-management/albums-management').then(m => m.AlbumsManagement)
  },
  {
    path: 'students',
    loadComponent: () =>
      import('./students/students').then(m => m.Students)
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
];