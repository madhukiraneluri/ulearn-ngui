import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface AdminCourseFilterOption {
  id: string;
  title: string;
  status?: string;
}

@Component({
  selector: 'app-admin-course-multi-filter',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-course-multi-filter.html',
  styleUrl: './admin-course-multi-filter.scss'
})
export class AdminCourseMultiFilter {
  private readonly elRef = inject(ElementRef);

  readonly courses = input.required<AdminCourseFilterOption[]>();
  readonly label = input('Filter by course');
  readonly placeholder = input('Search courses to filter…');
  readonly minSearchChars = input(2);

  readonly selectedCourseIds = input<string[]>([]);
  readonly selectedCourseIdsChange = output<string[]>();

  readonly searchQuery = signal('');
  readonly isOpen = signal(false);

  readonly filteredCourses = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const list = this.courses();
    if (!q || q.length < this.minSearchChars()) {
      return list;
    }
    return list.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.status?.toLowerCase().includes(q) ?? false)
    );
  });

  readonly selectedCourses = computed(() => {
    const ids = new Set(this.selectedCourseIds());
    return this.courses().filter((c) => ids.has(c.id));
  });

  isSelected(courseId: string): boolean {
    return this.selectedCourseIds().includes(courseId);
  }

  toggleCourse(courseId: string): void {
    const current = this.selectedCourseIds();
    const next = current.includes(courseId)
      ? current.filter((id) => id !== courseId)
      : [...current, courseId];
    this.selectedCourseIdsChange.emit(next);
  }

  clearFilters(): void {
    this.selectedCourseIdsChange.emit([]);
    this.searchQuery.set('');
  }

  removeCourse(courseId: string): void {
    this.selectedCourseIdsChange.emit(
      this.selectedCourseIds().filter((id) => id !== courseId)
    );
  }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.isOpen.set(true);
  }

  onFocus(): void {
    this.isOpen.set(true);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elRef.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
    }
  }
}
