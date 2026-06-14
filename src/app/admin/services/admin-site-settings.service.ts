import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';
import { HOME_HERO_IMAGE_KEY } from '../../shared/services/site-settings.service';

@Injectable({ providedIn: 'root' })
export class AdminSiteSettingsService {
  async getSetting(key: string): Promise<string> {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (error) {
      console.error('AdminSiteSettingsService.getSetting:', error);
      return '';
    }

    return (data?.['value'] as string | undefined) ?? '';
  }

  async upsertSetting(key: string, value: string): Promise<void> {
    const { error } = await supabase.from('site_settings').upsert(
      { key, value: value.trim() },
      { onConflict: 'key' }
    );

    if (error) {
      console.error('AdminSiteSettingsService.upsertSetting:', error);
      throw new Error(error.message);
    }
  }

  async uploadHomeHeroImage(file: File): Promise<string> {
    const path = `hero/${crypto.randomUUID()}.jpg`;

    const { error } = await supabase.storage
      .from('home-hero-images')
      .upload(path, file, { upsert: false, contentType: 'image/jpeg' });

    if (error) {
      console.error('AdminSiteSettingsService.uploadHomeHeroImage:', error);
      throw new Error(error.message);
    }

    const { data } = supabase.storage.from('home-hero-images').getPublicUrl(path);
    return data.publicUrl;
  }

  async getHomeHeroImageUrl(): Promise<string> {
    return this.getSetting(HOME_HERO_IMAGE_KEY);
  }

  async saveHomeHeroImageUrl(url: string): Promise<void> {
    await this.upsertSetting(HOME_HERO_IMAGE_KEY, url);
  }
}
