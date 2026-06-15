import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';

export interface EnrollmentUnlockRow {
  enrollmentId: string;
  userId: string;
  name: string;
  email: string | null;
  liveClassStartMonth: string | null;
  unlockedModuleIds: string[];
}

export interface CourseModuleOption {
  id: string;
  title: string;
  order: number;
}

@Injectable({ providedIn: 'root' })
export class AdminModuleUnlocksService {
  async getModulesForCourse(courseId: string): Promise<CourseModuleOption[]> {
    const { data, error } = await supabase
      .from('course_curriculum')
      .select('id, title, order')
      .eq('course_id', courseId)
      .order('order', { ascending: true });

    if (error) {
      console.error('AdminModuleUnlocksService.getModulesForCourse:', error);
      return [];
    }

    return (data ?? []).map((m) => ({
      id: String(m.id),
      title: String(m.title),
      order: Number(m.order)
    }));
  }

  async getEnrollmentUnlocks(courseId: string): Promise<EnrollmentUnlockRow[]> {
    const { data: enrollments, error } = await supabase
      .from('enrollments')
      .select('id, user_id, live_class_start_month')
      .eq('course_id', courseId)
      .order('enrolled_at', { ascending: false });

    if (error || !enrollments?.length) {
      if (error) console.error('AdminModuleUnlocksService.getEnrollmentUnlocks:', error);
      return [];
    }

    const enrollmentIds = enrollments.map((e) => String(e.id));
    const userIds = enrollments.map((e) => String(e.user_id));

    const [{ data: profiles }, { data: unlocks }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email').in('id', userIds),
      supabase
        .from('module_unlocks')
        .select('enrollment_id, module_id')
        .in('enrollment_id', enrollmentIds)
    ]);

    const profileMap = new Map(
      (profiles ?? []).map((p) => [
        String(p.id),
        { name: String(p.full_name ?? 'Unnamed'), email: (p.email as string | null) ?? null }
      ])
    );

    const unlockMap = new Map<string, string[]>();
    for (const u of unlocks ?? []) {
      const eid = String(u.enrollment_id);
      const list = unlockMap.get(eid) ?? [];
      list.push(String(u.module_id));
      unlockMap.set(eid, list);
    }

    return enrollments.map((e) => {
      const userId = String(e.user_id);
      const eid = String(e.id);
      const profile = profileMap.get(userId);
      return {
        enrollmentId: eid,
        userId,
        name: profile?.name ?? 'Unnamed user',
        email: profile?.email ?? null,
        liveClassStartMonth: (e.live_class_start_month as string | null) ?? null,
        unlockedModuleIds: unlockMap.get(eid) ?? []
      };
    });
  }

  async unlockModule(
    enrollmentId: string,
    moduleId: string,
    adminUserId: string
  ): Promise<boolean> {
    const { error } = await supabase.from('module_unlocks').insert({
      enrollment_id: enrollmentId,
      module_id: moduleId,
      unlocked_by: adminUserId
    });

    if (error) {
      if (error.code === '23505') return true;
      console.error('AdminModuleUnlocksService.unlockModule:', error);
      return false;
    }
    return true;
  }

  async lockModule(enrollmentId: string, moduleId: string): Promise<boolean> {
    const { error } = await supabase
      .from('module_unlocks')
      .delete()
      .eq('enrollment_id', enrollmentId)
      .eq('module_id', moduleId);

    if (error) {
      console.error('AdminModuleUnlocksService.lockModule:', error);
      return false;
    }
    return true;
  }

  async unlockModuleForEnrollments(
    enrollmentIds: string[],
    moduleId: string,
    adminUserId: string
  ): Promise<boolean> {
    if (enrollmentIds.length === 0) return true;

    const rows = enrollmentIds.map((enrollmentId) => ({
      enrollment_id: enrollmentId,
      module_id: moduleId,
      unlocked_by: adminUserId || null
    }));

    const { error } = await supabase.from('module_unlocks').upsert(rows, {
      onConflict: 'enrollment_id,module_id',
      ignoreDuplicates: true
    });

    if (error) {
      console.error('AdminModuleUnlocksService.unlockModuleForEnrollments:', error);
      return false;
    }
    return true;
  }

  async lockModuleForEnrollments(
    enrollmentIds: string[],
    moduleId: string
  ): Promise<boolean> {
    if (enrollmentIds.length === 0) return true;

    const { error } = await supabase
      .from('module_unlocks')
      .delete()
      .eq('module_id', moduleId)
      .in('enrollment_id', enrollmentIds);

    if (error) {
      console.error('AdminModuleUnlocksService.lockModuleForEnrollments:', error);
      return false;
    }
    return true;
  }
}
