import {
  Component, ChangeDetectionStrategy, signal,
  computed, inject, OnInit, OnDestroy
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { PaperService } from '../../shared/services/paper.service';
import { ResearchPaper, PaperCategory } from '../../models';

interface FilterState {
  categories: PaperCategory[];
  years: number[];
  venues: string[];
  searchQuery: string;
}

@Component({
  selector: 'app-research-papers',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './research-papers.html',
  styleUrl: './research-papers.scss'
})
export class ResearchPapers implements OnInit, OnDestroy {
  private readonly router       = inject(Router);
  private readonly route        = inject(ActivatedRoute);
  private readonly paperService = inject(PaperService);
  private readonly destroy$     = new Subject<void>();

  readonly allPapers  = signal<ResearchPaper[]>([]);
  readonly isLoading  = signal(true);

  readonly filters = signal<FilterState>({
    categories: [], years: [], venues: [], searchQuery: '',
  });

  readonly filterPanelOpen = signal(true);
  readonly mobilePanelOpen = signal(false);
  readonly sortBy = signal<'cited' | 'newest' | 'oldest'>('cited');

  // ── Options ───────────────────────────────────────────────────────────────
  readonly categoryOptions = [
    { value: 'ai'       as PaperCategory, label: 'AI / ML',          color: 'var(--purple)', icon: '🤖' },
    { value: 'nlp'      as PaperCategory, label: 'NLP',              color: 'var(--blue)',   icon: '💬' },
    { value: 'cv'       as PaperCategory, label: 'Computer Vision',  color: 'var(--orange)', icon: '👁️' },
    { value: 'health'   as PaperCategory, label: 'Healthcare AI',    color: 'var(--red)',    icon: '🏥' },
    { value: 'business' as PaperCategory, label: 'Business',         color: 'var(--green)',  icon: '📊' },
  ];

  readonly yearOptions = [2024, 2023, 2022];

  readonly venueOptions = ['IEEE', 'ACM', 'NeurIPS', 'ICML', 'Springer', 'EDM'];

  readonly sortOptions = [
    { value: 'cited'  as const, label: 'Most Cited'   },
    { value: 'newest' as const, label: 'Newest First'  },
    { value: 'oldest' as const, label: 'Oldest First'  },
  ];

  // ── Computed ──────────────────────────────────────────────────────────────
  readonly filteredPapers = computed(() => {
    const f    = this.filters();
    // Only show published papers
    let list   = this.allPapers().filter(p => p.status === 'published');

    if (f.searchQuery.trim()) {
      const q = f.searchQuery.toLowerCase();
      list = list.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.abstract.toLowerCase().includes(q) ||
        p.authors.some(a => a.toLowerCase().includes(q)) ||
        p.venue.toLowerCase().includes(q)
      );
    }

    if (f.categories.length > 0) {
      list = list.filter(p => f.categories.includes(p.category));
    }

    if (f.years.length > 0) {
      list = list.filter(p => f.years.includes(p.year));
    }

    if (f.venues.length > 0) {
      list = list.filter(p =>
        f.venues.some(v => p.venue.toUpperCase().includes(v))
      );
    }

    const sort = this.sortBy();
    if (sort === 'cited')  list.sort((a, b) => b.citations - a.citations);
    if (sort === 'newest') list.sort((a, b) => b.year - a.year);
    if (sort === 'oldest') list.sort((a, b) => a.year - b.year);

    return list;
  });

  readonly totalCitations = computed(() =>
    this.allPapers()
      .filter(p => p.status === 'published')
      .reduce((sum, p) => sum + p.citations, 0)
  );

  readonly totalVenues = computed(() =>
    new Set(
      this.allPapers()
        .filter(p => p.status === 'published')
        .map(p => p.venue)
    ).size
  );

  readonly activeFilterCount = computed(() => {
    const f = this.filters();
    let count = 0;
    if (f.categories.length > 0)  count++;
    if (f.years.length > 0)       count++;
    if (f.venues.length > 0)      count++;
    if (f.searchQuery.trim())     count++;
    return count;
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.paperService.getPapers().subscribe(papers => {
      this.allPapers.set(papers);
      this.isLoading.set(false);
    });

    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        const catParam   = params['category'] as string | undefined;
        const yearParam  = params['year']     as string | undefined;
        const venueParam = params['venue']    as string | undefined;
        const search     = params['q']        ?? '';
        const sort       = params['sort']     ?? 'cited';

        const validCats   = ['ai','nlp','cv','health','business'];
        const cats        = catParam
          ? catParam.split(',').filter(c => validCats.includes(c)) as PaperCategory[]
          : [];
        const years       = yearParam
          ? yearParam.split(',').map(Number).filter(y => !isNaN(y))
          : [];
        const venues      = venueParam ? venueParam.split(',') : [];

        this.filters.update(f => ({
          ...f, categories: cats, years, venues, searchQuery: search,
        }));

        if (['cited','newest','oldest'].includes(sort)) {
          this.sortBy.set(sort as any);
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── URL Sync ──────────────────────────────────────────────────────────────
  private syncToUrl(): void {
    const f = this.filters();
    const params: Record<string, string> = {};

    if (f.categories.length > 0)  params['category'] = f.categories.join(',');
    if (f.years.length > 0)       params['year']     = f.years.join(',');
    if (f.venues.length > 0)      params['venue']    = f.venues.join(',');
    if (f.searchQuery.trim())     params['q']        = f.searchQuery.trim();
    if (this.sortBy() !== 'cited') params['sort']    = this.sortBy();

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: '',
      replaceUrl: true,
    });
  }

  // ── Filter Actions ────────────────────────────────────────────────────────
  toggleCategory(val: PaperCategory): void {
    this.filters.update(f => {
      const cats = f.categories.includes(val)
        ? f.categories.filter(c => c !== val)
        : [...f.categories, val];
      return { ...f, categories: cats };
    });
    this.syncToUrl();
  }

  isCategorySelected(val: PaperCategory): boolean {
    return this.filters().categories.includes(val);
  }

  toggleYear(val: number): void {
    this.filters.update(f => {
      const years = f.years.includes(val)
        ? f.years.filter(y => y !== val)
        : [...f.years, val];
      return { ...f, years };
    });
    this.syncToUrl();
  }

  isYearSelected(val: number): boolean {
    return this.filters().years.includes(val);
  }

  toggleVenue(val: string): void {
    this.filters.update(f => {
      const venues = f.venues.includes(val)
        ? f.venues.filter(v => v !== val)
        : [...f.venues, val];
      return { ...f, venues };
    });
    this.syncToUrl();
  }

  isVenueSelected(val: string): boolean {
    return this.filters().venues.includes(val);
  }

  setSearch(val: string): void {
    this.filters.update(f => ({ ...f, searchQuery: val }));
    this.syncToUrl();
  }

  setSortBy(val: 'cited' | 'newest' | 'oldest'): void {
    this.sortBy.set(val);
    this.syncToUrl();
  }

  clearAllFilters(): void {
    this.filters.set({ categories: [], years: [], venues: [], searchQuery: '' });
    this.syncToUrl();
  }

  toggleFilterPanel(): void { this.filterPanelOpen.update(v => !v); }
  toggleMobilePanel(): void { this.mobilePanelOpen.update(v => !v); }

  // ── Helpers ───────────────────────────────────────────────────────────────
  getCategoryInfo(cat: PaperCategory): { label: string; color: string; icon: string } {
    return this.categoryOptions.find(c => c.value === cat)
      ?? { label: cat, color: 'var(--purple)', icon: '📄' };
  }

  openPublication(paper: ResearchPaper): void {
    const url = paper.doiUrl || paper.pdfUrl;
    if (url && url !== '#') {
      window.open(url, '_blank', 'noopener');
    }
  }

  truncateAbstract(text: string, maxLength = 180): string {
    return text.length > maxLength
      ? text.substring(0, maxLength) + '...'
      : text;
  }
} 