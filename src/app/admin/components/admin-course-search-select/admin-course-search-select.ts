import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface AdminCourseSearchOption {
  id: string;
  title: string;
  status?: string;
}

@Component({
  selector: 'app-admin-course-search-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-course-search-select.html',
  styleUrl: './admin-course-search-select.scss'
})
export class AdminCourseSearchSelect {
  private readonly elRef = inject(ElementRef);

  readonly courses = input.required<AdminCourseSearchOption[]>();
  readonly label = input('Course');
  readonly placeholder = input('Search courses…');
  readonly showStatus = input(true);
  readonly minSearchChars = input(2);

  readonly courseId = input<string | null>(null);
  readonly courseIdChange = output<string | null>();

  readonly searchQuery = signal('');
  readonly isOpen = signal(false);

  readonly filteredCourses = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const list = this.courses();
    const selected = list.find((c) => c.id === this.courseId());
    const selectedLabel = selected ? this.displayLabel(selected).toLowerCase() : '';

    // Input shows the selected course — not an active search
    if (!q || q === selectedLabel) {
      return list;
    }

    if (q.length < this.minSearchChars()) {
      return list;
    }

    return list.filter((c) => this.displayLabel(c).toLowerCase().includes(q));
  });

  constructor() {
    effect(() => {
      const id = this.courseId();
      const course = this.courses().find((c) => c.id === id);
      if (course) {
        this.searchQuery.set(this.displayLabel(course));
      }
    });
  }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.isOpen.set(true);
  }

  onFocus(): void {
    this.isOpen.set(true);
  }

  selectCourse(course: AdminCourseSearchOption): void {
    this.courseIdChange.emit(course.id);
    this.searchQuery.set(this.displayLabel(course));
    this.isOpen.set(false);
  }

  displayLabel(course: AdminCourseSearchOption): string {
    if (this.showStatus() && course.status) {
      return `${course.title} (${course.status})`;
    }
    return course.title;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elRef.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
    }
  }
}
