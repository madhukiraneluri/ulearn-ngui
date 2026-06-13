import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpRequest, HttpEventType, HttpHeaders } from '@angular/common/http';
import { Observable, switchMap, map, filter } from 'rxjs';
import { UploadResponse } from '../../models';

export interface UploadProgress {
  percent: number;
  done: boolean;
  url?: string;
}

/**
 * @deprecated Use Supabase Storage for uploads instead.
 * This old S3-based service is no longer actively used.
 */
@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly http   = inject(HttpClient);
  private readonly apiUrl = '/api/uploads'; // Placeholder; not used with Supabase

  uploadFile(file: File, folder: string): Observable<UploadProgress> {
    return this.getPresignedUrl(file.name, file.type, folder).pipe(
      switchMap(({ key, url }) =>
        this.putToS3(url, file).pipe(
          map(progress => ({
            ...progress,
            url: progress.done
              ? `https://s3.example.com/${key}` // Placeholder; use Supabase Storage instead
              : undefined
          }))
        )
      )
    );
  }

  uploadFileSimple(file: File, folder: string): Observable<string> {
    return this.uploadFile(file, folder).pipe(
      filter(p => p.done),
      map(p => p.url!)
    );
  }

  validateImage(file: File, maxMb = 5): string | null {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      return 'Only JPEG, PNG, WebP, and SVG images are allowed.';
    }
    if (file.size > maxMb * 1024 * 1024) {
      return `Image must be smaller than ${maxMb}MB.`;
    }
    return null;
  }

  validatePdf(file: File, maxMb = 20): string | null {
    if (file.type !== 'application/pdf') {
      return 'Only PDF files are allowed.';
    }
    if (file.size > maxMb * 1024 * 1024) {
      return `PDF must be smaller than ${maxMb}MB.`;
    }
    return null;
  }

  private getPresignedUrl(
    filename: string,
    contentType: string,
    folder: string
  ): Observable<UploadResponse> {
    return this.http.post<UploadResponse>(`${this.apiUrl}/presigned-url`, {
      filename, contentType, folder
    });
  }

  private putToS3(presignedUrl: string, file: File): Observable<UploadProgress> {
    const req = new HttpRequest('PUT', presignedUrl, file, {
      headers: new HttpHeaders({ 'Content-Type': file.type }),
      reportProgress: true
    });
    return this.http.request(req).pipe(
      map(event => {
        if (event.type === HttpEventType.UploadProgress) {
          const percent = event.total
            ? Math.round((100 * event.loaded) / event.total)
            : 0;
          return { percent, done: false };
        }
        if (event.type === HttpEventType.Response) {
          return { percent: 100, done: true };
        }
        return { percent: 0, done: false };
      }),
      filter(p => p.percent > 0 || p.done)
    );
  }
}