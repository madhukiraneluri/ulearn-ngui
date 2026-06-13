import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap } from 'rxjs/operators';

interface HipolabsUniversity {
  name: string;
  country: string;
  'state-province': string | null;
}

interface StackOverflowTagResponse {
  items: { name: string }[];
}

const SPECIALIZATIONS = [
  'Computer Science & Engineering',
  'Information Technology',
  'Electronics & Communication Engineering',
  'Electrical & Electronics Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Chemical Engineering',
  'Biotechnology',
  'Biomedical Engineering',
  'Aerospace Engineering',
  'Automobile Engineering',
  'Artificial Intelligence & Machine Learning',
  'Data Science',
  'Cyber Security',
  'Internet of Things',
  'Robotics & Automation',
  'Instrumentation Engineering',
  'Production Engineering',
  'Industrial Engineering',
  'Metallurgical Engineering',
  'Mining Engineering',
  'Petroleum Engineering',
  'Environmental Engineering',
  'Agricultural Engineering',
  'Textile Engineering',
  'Fashion Technology',
  'Architecture',
  'Interior Design',
  'Bachelor of Commerce (B.Com)',
  'Bachelor of Business Administration (BBA)',
  'Bachelor of Arts (B.A)',
  'Bachelor of Science (B.Sc)',
  'Master of Business Administration (MBA)',
  'Master of Computer Applications (MCA)',
  'Master of Technology (M.Tech)',
  'Chartered Accountancy (CA)',
  'Company Secretary (CS)',
  'Cost & Management Accountancy (CMA)',
  'Finance',
  'Marketing',
  'Human Resource Management',
  'Operations Management',
  'International Business',
  'Economics',
  'Statistics',
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Microbiology',
  'Pharmacy',
  'Nursing',
  'Medicine (MBBS)',
  'Dental Surgery (BDS)',
  'Law (LLB)',
  'Journalism & Mass Communication',
  'Psychology',
  'Sociology',
  'Political Science',
  'English Literature',
  'Fine Arts',
  'Hotel Management',
  'Animation & Multimedia',
  'Game Development',
  'Cloud Computing',
  'DevOps',
  'Full Stack Development',
  'Mobile App Development',
  'UI/UX Design',
  'Digital Marketing',
  'Other'
];

@Injectable({ providedIn: 'root' })
export class ProfileLookupService {
  private readonly http = inject(HttpClient);

  searchColleges(query: string): Observable<string[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return of([]);
    }

    return this.http
      .get<HipolabsUniversity[]>('https://universities.hipolabs.com/search', {
        params: { name: trimmed, country: 'India' }
      })
      .pipe(
        map(universities =>
          universities
            .map(u => u.name)
            .filter((name, index, arr) => arr.indexOf(name) === index)
            .slice(0, 15)
        ),
        catchError(() => of([]))
      );
  }

  searchSpecializations(query: string): Observable<string[]> {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return of(SPECIALIZATIONS.slice(0, 15));
    }

    const matches = SPECIALIZATIONS.filter(s =>
      s.toLowerCase().includes(trimmed)
    ).slice(0, 15);

    return of(matches);
  }

  searchSkills(query: string): Observable<string[]> {
    const trimmed = query.trim();
    if (trimmed.length < 1) {
      return of([]);
    }

    return this.http
      .get<StackOverflowTagResponse>(
        'https://api.stackexchange.com/2.3/tags',
        {
          params: {
            order: 'desc',
            sort: 'popular',
            inname: trimmed,
            site: 'stackoverflow',
            pagesize: '15'
          }
        }
      )
      .pipe(
        map(res => res.items.map(item => item.name)),
        catchError(() => of(this.fallbackSkills(trimmed)))
      );
  }

  /** Debounced search helper for components */
  createDebouncedSearch<T>(
    searchFn: (query: string) => Observable<T[]>
  ): (query: string) => Observable<T[]> {
    return (query: string) =>
      of(query).pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap(q => searchFn(q))
      );
  }

  private fallbackSkills(query: string): string[] {
    const common = [
      'javascript', 'typescript', 'python', 'java', 'react', 'angular',
      'nodejs', 'html', 'css', 'sql', 'mongodb', 'postgresql', 'aws',
      'docker', 'kubernetes', 'git', 'machine-learning', 'data-analysis',
      'communication', 'leadership', 'problem-solving', 'teamwork'
    ];
    const q = query.toLowerCase();
    return common.filter(s => s.includes(q)).slice(0, 15);
  }
}
