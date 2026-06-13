import {
  Component,
  ChangeDetectionStrategy,
  forwardRef,
  inject,
  input,
  signal,
  ChangeDetectorRef,
  ElementRef,
  HostListener
} from '@angular/core';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
  FormsModule
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Observable, Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-searchable-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SearchableSelect),
      multi: true
    }
  ],
  templateUrl: './searchable-select.html',
  styleUrl: './searchable-select.scss'
})
export class SearchableSelect implements ControlValueAccessor {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly elRef = inject(ElementRef);

  readonly label = input('');
  readonly placeholder = input('Search...');
  readonly searchFn = input.required<(query: string) => Observable<string[]>>();
  readonly disabled = input(false);

  readonly options = signal<string[]>([]);
  readonly isOpen = signal(false);
  readonly isLoading = signal(false);
  readonly searchText = signal('');
  readonly hasError = signal(false);

  private value = '';
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  private isDisabled = false;
  private searchSub: Subscription | null = null;

  writeValue(value: string): void {
    this.value = value ?? '';
    this.searchText.set(this.value);
    this.cdr.markForCheck();
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled = isDisabled;
    this.cdr.markForCheck();
  }

  isControlDisabled(): boolean {
    return this.isDisabled || this.disabled();
  }

  onInputChange(text: string): void {
    this.searchText.set(text);
    this.isOpen.set(true);
    this.onChange(text);
    this.runSearch(text);
  }

  onFocus(): void {
    if (this.isControlDisabled()) return;
    this.isOpen.set(true);
    this.onTouched();
    if (this.options().length === 0) {
      this.runSearch(this.searchText());
    }
  }

  selectOption(option: string): void {
    this.value = option;
    this.searchText.set(option);
    this.onChange(option);
    this.isOpen.set(false);
    this.cdr.markForCheck();
  }

  clearSelection(): void {
    this.value = '';
    this.searchText.set('');
    this.onChange('');
    this.options.set([]);
    this.cdr.markForCheck();
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
      .pipe(
        finalize(() => {
          this.isLoading.set(false);
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: results => {
          this.options.set(results);
          this.cdr.markForCheck();
        },
        error: () => {
          this.options.set([]);
          this.cdr.markForCheck();
        }
      });
  }
}
