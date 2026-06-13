import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  inject,
  DestroyRef,
  ChangeDetectorRef,
  ElementRef,
  HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, Subscription } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-searchable-multi-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './searchable-multi-select.html',
  styleUrl: './searchable-multi-select.scss'
})
export class SearchableMultiSelect {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly elRef = inject(ElementRef);

  readonly label = input('Skills');
  readonly placeholder = input('Search and select skills...');
  readonly searchFn = input.required<(query: string) => Observable<string[]>>();
  readonly selected = input<string[]>([]);

  readonly selectedChange = output<string[]>();

  readonly options = signal<string[]>([]);
  readonly isOpen = signal(false);
  readonly isLoading = signal(false);
  readonly searchText = signal('');

  private searchSub: Subscription | null = null;

  onInputChange(text: string): void {
    this.searchText.set(text);
    this.isOpen.set(true);
    this.runSearch(text);
  }

  onFocus(): void {
    this.isOpen.set(true);
    if (this.options().length === 0) {
      this.runSearch(this.searchText());
    }
  }

  selectOption(option: string): void {
    const current = this.selected();
    if (!current.includes(option)) {
      this.selectedChange.emit([...current, option]);
    }
    this.searchText.set('');
    this.isOpen.set(false);
    this.cdr.markForCheck();
  }

  removeItem(item: string): void {
    this.selectedChange.emit(this.selected().filter(s => s !== item));
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elRef.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
      this.cdr.markForCheck();
    }
  }

  private runSearch(query: string): void {
    this.searchSub?.unsubscribe();
    this.isLoading.set(true);

    this.searchSub = this.searchFn()(query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: results => {
          const filtered = results.filter(r => !this.selected().includes(r));
          this.options.set(filtered);
          this.isLoading.set(false);
          this.cdr.markForCheck();
        },
        error: () => {
          this.options.set([]);
          this.isLoading.set(false);
          this.cdr.markForCheck();
        }
      });
  }
}
