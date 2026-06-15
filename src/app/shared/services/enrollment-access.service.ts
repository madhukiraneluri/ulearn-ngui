import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';

@Injectable({ providedIn: 'root' })
export class EnrollmentAccessService {
  private unlockCache = new Map<string, { moduleIds: Set<string>; fetchedAt: number }>();
  private readonly cacheTtlMs = 60_000;

  async getEnrollmentId(userId: string, courseId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('enrollments')
      .select('id')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .maybeSingle();

    if (error || !data) return null;
    return String(data.id);
  }

  async getUnlockedModuleIds(userId: string, courseId: string): Promise<Set<string>> {
    const cacheKey = `${userId}:${courseId}`;
    const cached = this.unlockCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTtlMs) {
      return cached.moduleIds;
    }

    const enrollmentId = await this.getEnrollmentId(userId, courseId);
    if (!enrollmentId) {
      return new Set();
    }

    const { data, error } = await supabase
      .from('module_unlocks')
      .select('module_id')
      .eq('enrollment_id', enrollmentId);

    if (error) {
      console.error('EnrollmentAccessService.getUnlockedModuleIds:', error);
      return new Set();
    }

    const moduleIds = new Set((data ?? []).map((r) => String(r.module_id)));
    this.unlockCache.set(cacheKey, { moduleIds, fetchedAt: Date.now() });
    return moduleIds;
  }

  async isModuleUnlocked(userId: string, courseId: string, moduleId: string): Promise<boolean> {
    const unlocked = await this.getUnlockedModuleIds(userId, courseId);
    return unlocked.has(moduleId);
  }

  clearCache(userId?: string, courseId?: string): void {
    if (userId && courseId) {
      this.unlockCache.delete(`${userId}:${courseId}`);
    } else {
      this.unlockCache.clear();
    }
  }
}
