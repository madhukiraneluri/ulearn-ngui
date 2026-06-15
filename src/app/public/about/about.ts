import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  inject,
} from '@angular/core';

interface Pillar {
  title: string;
  description: string;
}

interface Differentiator {
  title: string;
  description: string;
}

interface FocusArea {
  label: string;
}

interface HeroStat {
  value: string;
  label: string;
}

@Component({
  selector: 'app-about',
  imports: [],
  templateUrl: './about.html',
  styleUrl: './about.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class About implements AfterViewInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private observer?: IntersectionObserver;

  readonly heroStats: HeroStat[] = [
    { value: '5+', label: 'Focus Domains' },
    { value: '100%', label: 'Industry-Aligned' },
    { value: 'Global', label: 'Learning Community' },
  ];

  readonly pillars: Pillar[] = [
    {
      title: 'Our Purpose',
      description:
        'Bridge the gap between academic education and industry expectations with practical, career-oriented learning.',
    },
    {
      title: 'Our Belief',
      description:
        'Every student deserves quality education, hands-on experience, and career guidance—regardless of background.',
    },
    {
      title: 'Our Growth',
      description:
        'From a skills initiative to a community of learners, educators, researchers, mentors, and industry partners.',
    },
  ];

  readonly missionItems = [
    'Deliver affordable, industry-aligned learning experiences.',
    'Bridge education and employment.',
    'Promote research-driven, creative learning.',
    'Enable internships, projects, and experiential programs.',
    'Foster leadership, entrepreneurship, and excellence.',
    'Build a global community of lifelong learners.',
  ];

  readonly differentiators: Differentiator[] = [
    {
      title: 'Industry-Oriented Learning',
      description: 'Curriculum aligned with current industry trends and emerging technologies.',
    },
    {
      title: 'Experiential Education',
      description: 'Internships, projects, workshops, and case studies for real-world readiness.',
    },
    {
      title: 'Research & Innovation',
      description: 'Structured guidance for research development and publication pathways.',
    },
    {
      title: 'Expert Mentorship',
      description: 'Insights from educators, researchers, and industry professionals.',
    },
    {
      title: 'Career Development',
      description: 'Certifications, employability training, and professional networking.',
    },
  ];

  readonly focusAreas: FocusArea[] = [
    { label: 'Technology Education' },
    { label: 'Business & Management' },
    { label: 'Research & Publications' },
    { label: 'Internship Programs' },
    { label: 'Professional Development' },
  ];

  readonly impactItems = [
    'Gain practical and industry-relevant skills.',
    'Improve employability and career prospects.',
    'Develop confidence and professional competence.',
    'Build research and innovation capabilities.',
    'Become leaders, entrepreneurs, and change-makers.',
    'Contribute meaningfully to organizations and communities.',
  ];

  ngAfterViewInit(): void {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nodes = Array.from(
      this.host.nativeElement.querySelectorAll('.reveal')
    ) as HTMLElement[];

    if (prefersReducedMotion) {
      nodes.forEach((node: HTMLElement) => node.classList.add('revealed'));
      return;
    }

    this.observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            this.observer?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: '0px 0px -48px 0px' }
    );

    nodes.forEach((node: HTMLElement) => this.observer?.observe(node));
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
