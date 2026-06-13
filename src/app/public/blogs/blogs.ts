import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BlogService } from '../../shared/services/blog.service';
import { BlogListItem } from '../../models';

@Component({
  selector: 'app-blogs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  templateUrl: './blogs.html',
  styleUrl: './blogs.scss'
})
export class Blogs implements OnInit {
  private readonly blogService = inject(BlogService);

  readonly blogs = signal<BlogListItem[]>([]);
  readonly isLoading = signal(true);

  ngOnInit(): void {
    this.blogService.getBlogs().subscribe((items) => {
      this.blogs.set(items);
      this.isLoading.set(false);
    });
  }

  formatDate(date?: string): string {
    if (!date) return '';
    return new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }
}
