import { Injectable } from '@angular/core';
import { from, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { supabase } from '../../core/supabase.client';
import { DEFAULT_HOME_HERO_IMAGE } from '../utils/drive-image.util';

export const HOME_HERO_IMAGE_KEY = 'home_hero_image_url';

@Injectable({ providedIn: 'root' })
export class SiteSettingsService {
  getHomeHeroImageUrl(): Observable<string> {
    return from(
      supabase
        .from('site_settings')
        .select('value')
        .eq('key', HOME_HERO_IMAGE_KEY)
        .maybeSingle()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        const value = (data?.['value'] as string | undefined)?.trim();
        return value || DEFAULT_HOME_HERO_IMAGE;
      }),
      catchError((err) => {
        console.error('SiteSettingsService.getHomeHeroImageUrl:', err);
        return of(DEFAULT_HOME_HERO_IMAGE);
      })
    );
  }
}
