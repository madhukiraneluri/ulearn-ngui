import { Routes } from '@angular/router';
import { examAuthGuard, examPortalGuestGuard } from './guards/exam-guards';

export const examRoutes: Routes = [
  {
    path: ':examId/attempt/:attemptId',
    canActivate: [examAuthGuard],
    loadComponent: () =>
      import('./exam-attempt/exam-attempt').then(m => m.ExamAttemptPage)
  },
  {
    path: '',
    loadComponent: () =>
      import('./exam-layout/exam-layout').then(m => m.ExamLayout),
    children: [
      {
        path: 'login',
        canActivate: [examPortalGuestGuard],
        loadComponent: () =>
          import('./exam-login/exam-login').then(m => m.ExamLogin)
      },
      {
        path: 'set-password',
        canActivate: [examAuthGuard],
        loadComponent: () =>
          import('./exam-set-password/exam-set-password').then(m => m.ExamSetPassword)
      },
      {
        path: 'dashboard',
        canActivate: [examAuthGuard],
        loadComponent: () =>
          import('./exam-dashboard/exam-dashboard').then(m => m.ExamDashboard)
      },
      {
        path: ':examId/start',
        canActivate: [examAuthGuard],
        loadComponent: () =>
          import('./exam-pre-check/exam-pre-check').then(m => m.ExamPreCheck)
      },
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      }
    ]
  }
];
