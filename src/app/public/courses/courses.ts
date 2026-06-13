import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { CourseService } from '../../shared/services/course.service';
import { CourseListItem, CourseCategory } from '../../models';

interface FilterState {
  categories: CourseCategory[];
  duration: string[];
  rating: number | null;
  researchOnly: boolean;
  searchQuery: string;
}

@Component({
  selector: 'app-courses',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './courses.html',
  styleUrl: './courses.scss',
})
export class Courses implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly courseService = inject(CourseService);
  private readonly destroy$ = new Subject<void>();

  readonly allCourses = signal<CourseListItem[]>([]);
  readonly isLoading = signal(true);

  readonly filters = signal<FilterState>({
    categories: [],
    duration: [],
    rating: null,
    researchOnly: false,
    searchQuery: '',
  });

  readonly filterPanelOpen = signal(true);
  readonly mobilePanelOpen = signal(false);
  readonly sortBy = signal<'rating' | 'price_asc' | 'price_desc' | 'popular'>('rating');

  // ── Options ──────────────────────────────────────────────────────────────────
  readonly categoryOptions = [
    { value: 'technical' as CourseCategory, label: 'Technical', color: 'var(--purple)' },
    { value: 'creative' as CourseCategory, label: 'Creative', color: 'var(--orange)' },
    { value: 'business' as CourseCategory, label: 'Business', color: 'var(--green)' },
  ];

  readonly durationOptions = [
    { value: 'short', label: '1–3 Months' },
    { value: 'medium', label: '4–6 Months' },
    { value: 'long', label: '6+ Months' },
  ];

  readonly ratingOptions = [
    { value: 4.5, label: '4.5★ & above' },
    { value: 4.0, label: '4.0★ & above' },
    { value: 0, label: 'All ratings' },
  ];

  readonly sortOptions = [
    { value: 'rating' as const, label: 'Top Rated' },
    { value: 'popular' as const, label: 'Most Popular' },
    { value: 'price_asc' as const, label: 'Price: Low–High' },
    { value: 'price_desc' as const, label: 'Price: High–Low' },
  ];

  // ── Computed ──────────────────────────────────────────────────────────────────
  readonly filteredCourses = computed(() => {
    const f = this.filters();
    let list = [...this.allCourses()];

    if (f.searchQuery.trim()) {
      const q = f.searchQuery.toLowerCase();
      list = list.filter(
        (c) => c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q),
      );
    }
    if (f.categories.length > 0) {
      list = list.filter((c) => f.categories.includes(c.category));
    }
    if (f.duration.length > 0) {
      list = list.filter((c) => {
        if (f.duration.includes('short') && c.durationMonths <= 3) return true;
        if (f.duration.includes('medium') && c.durationMonths >= 4 && c.durationMonths <= 6)
          return true;
        if (f.duration.includes('long') && c.durationMonths > 6) return true;
        return false;
      });
    }
    if (f.rating !== null && f.rating > 0) {
      list = list.filter((c) => c.rating >= f.rating!);
    }
    if (f.researchOnly) {
      list = list.filter((c) => c.isResearchCourse);
    }

    const sort = this.sortBy();
    if (sort === 'rating') list.sort((a, b) => b.rating - a.rating);
    if (sort === 'popular') list.sort((a, b) => b.totalStudents - a.totalStudents);
    if (sort === 'price_asc') list.sort((a, b) => a.price - b.price);
    if (sort === 'price_desc') list.sort((a, b) => b.price - a.price);

    return list;
  });

  readonly activeFilterCount = computed(() => {
    const f = this.filters();
    let count = 0;
    if (f.categories.length > 0) count++;
    if (f.duration.length > 0) count++;
    if (f.rating !== null && f.rating > 0) count++;
    if (f.researchOnly) count++;
    if (f.searchQuery.trim()) count++;
    return count;
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.courseService.getCourses().subscribe((courses) => {
      this.allCourses.set(courses);
      this.isLoading.set(false);
    });

    // URL → filter state (read URL params and apply to filters)
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const catParam = params['category'] as string | undefined;
      const research = params['research'] === 'true';
      const search = params['q'] ?? '';
      const sort = params['sort'] ?? 'rating';

      // Support comma-separated: ?category=technical,creative
      const validCats = ['technical', 'creative', 'business'];
      const cats = catParam
        ? (catParam.split(',').filter((c) => validCats.includes(c)) as CourseCategory[])
        : [];

      this.filters.update((f) => ({
        ...f,
        categories: cats,
        researchOnly: research,
        searchQuery: search,
      }));

      if (['rating', 'popular', 'price_asc', 'price_desc'].includes(sort)) {
        this.sortBy.set(sort as any);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Filter → URL sync ─────────────────────────────────────────────────────────
  private syncToUrl(): void {
    const f = this.filters();
    const params: Record<string, string> = {};

    if (f.categories.length > 0) params['category'] = f.categories.join(',');
    if (f.researchOnly) params['research'] = 'true';
    if (f.searchQuery.trim()) params['q'] = f.searchQuery.trim();
    if (this.sortBy() !== 'rating') params['sort'] = this.sortBy();

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: '',
      replaceUrl: true,
    });
  }

  // ── Filter Actions ────────────────────────────────────────────────────────────
  toggleCategory(cat: CourseCategory): void {
    this.filters.update((f) => {
      const cats = f.categories.includes(cat)
        ? f.categories.filter((c) => c !== cat)
        : [...f.categories, cat];
      return { ...f, categories: cats };
    });
    this.syncToUrl();
  }

  isCategorySelected(cat: CourseCategory): boolean {
    return this.filters().categories.includes(cat);
  }

  toggleDuration(val: string): void {
    this.filters.update((f) => {
      const dur = f.duration.includes(val)
        ? f.duration.filter((d) => d !== val)
        : [...f.duration, val];
      return { ...f, duration: dur };
    });
    this.syncToUrl();
  }

  isDurationSelected(val: string): boolean {
    return this.filters().duration.includes(val);
  }

  setRating(val: number): void {
    this.filters.update((f) => ({ ...f, rating: val }));
    this.syncToUrl();
  }

  setSearch(val: string): void {
    this.filters.update((f) => ({ ...f, searchQuery: val }));
    this.syncToUrl();
  }

  toggleResearch(): void {
    this.filters.update((f) => ({ ...f, researchOnly: !f.researchOnly }));
    this.syncToUrl();
  }

  clearAllFilters(): void {
    this.filters.set({
      categories: [],
      duration: [],
      rating: null,
      researchOnly: false,
      searchQuery: '',
    });
    this.syncToUrl();
  }

  setSortBy(val: 'rating' | 'price_asc' | 'price_desc' | 'popular'): void {
    this.sortBy.set(val);
    this.syncToUrl();
  }

  toggleFilterPanel(): void {
    this.filterPanelOpen.update((v) => !v);
  }

  toggleMobilePanel(): void {
    this.mobilePanelOpen.update((v) => !v);
  }

  openCourse(slug: string): void {
    this.router.navigate(['/courses', slug]);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  getCategoryColor(cat: CourseCategory): string {
    const map: Record<CourseCategory, string> = {
      technical: 'var(--purple)',
      creative: 'var(--orange)',
      business: 'var(--green)',
    };
    return map[cat];
  }

  getCategoryTagBg(cat: CourseCategory): string {
    const map: Record<CourseCategory, string> = {
      technical: 'rgba(139,111,190,.12)',
      creative: 'rgba(244,132,95,.12)',
      business: 'rgba(76,175,80,.12)',
    };
    return map[cat];
  }

  getCategoryEmoji(cat: CourseCategory): string {
    const map: Record<CourseCategory, string> = {
      technical: '💻',
      creative: '🎨',
      business: '📊',
    };
    return map[cat];
  }

  formatPrice(price: number): string {
    return '₹' + price.toLocaleString('en-IN');
  }

  getDiscount(price: number, original: number): number {
    return Math.round((1 - price / original) * 100);
  }
}
