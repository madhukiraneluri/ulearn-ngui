import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  ULEARN_EMAILS,
  ULEARN_LINKTREE,
  ULEARN_PHONE_DISPLAY,
  ULEARN_PHONE_TEL,
  ULEARN_SOCIALS
} from '../../constants/contact.constants';

@Component({
  selector: 'app-footer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
})
export class Footer {
  private readonly router = inject(Router);

  readonly currentYear = new Date().getFullYear();
  readonly contactEmails = ULEARN_EMAILS;
  readonly socials = ULEARN_SOCIALS;
  readonly phoneDisplay = ULEARN_PHONE_DISPLAY;
  readonly phoneTel = ULEARN_PHONE_TEL;
  readonly linktree = ULEARN_LINKTREE;

  readonly courseLinks = [
    {
      label: 'Technical',
      path: '/courses',
      query: { category: 'technical' } as Record<string, string>,
    },
    {
      label: 'Creative',
      path: '/courses',
      query: { category: 'creative' } as Record<string, string>,
    },
    {
      label: 'Business',
      path: '/courses',
      query: { category: 'business' } as Record<string, string>,
    },
    {
      label: 'AI/ML Research',
      path: '/courses',
      query: { research: 'true' } as Record<string, string>,
    },
  ];

  readonly companyLinks = [
    { label: 'About Us', path: '/about' },
    { label: 'Research Papers', path: '/research-papers' },
    { label: 'Blogs', path: '/blogs' },
    { label: 'Refer & Earn', path: '/refer' },
  ];

  readonly legalLinks = [
    { label: 'Privacy Policy' },
    { label: 'Terms of Use' },
    { label: 'Refund Policy' },
  ];

  navigate(path: string, query?: Record<string, string>): void {
    this.router.navigate([path], query ? { queryParams: query } : {});
  }
}
