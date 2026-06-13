import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BlogService } from '../../shared/services/blog.service';
import { Blog, BlogImage } from '../../models';

@Component({
  selector: 'app-blog-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  templateUrl: './blog-detail.html',
  styleUrl: './blog-detail.scss'
})
export class BlogDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly blogService = inject(BlogService);

  readonly blog = signal<Blog | null>(null);
  readonly isLoading = signal(true);
  readonly lightboxImage = signal<BlogImage | null>(null);

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug');
    if (!slug) {
      this.isLoading.set(false);
      return;
    }

    this.blogService.getBlogBySlug(slug).subscribe((item) => {
      this.blog.set(item);
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

  coverUrl(blog: Blog): string | undefined {
    return blog.coverImageUrl || blog.images[0]?.url;
  }

  contentParagraphs(content: string): string[] {
    return content.split(/\n\n+/).filter((p) => p.trim().length > 0);
  }

  openLightbox(image: BlogImage): void {
    this.lightboxImage.set(image);
  }

  closeLightbox(): void {
    this.lightboxImage.set(null);
  }
}
