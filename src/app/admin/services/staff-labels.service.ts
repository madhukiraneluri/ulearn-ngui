import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase.client';

export interface StaffLabel {
  id: string;
  slug: string;
  name: string;
  description: string;
  isSystem: boolean;
  portalAccess: boolean;
  memberCount: number;
  permissions: string[];
}

export interface LabelMember {
  userId: string;
  fullName: string;
  email: string;
}

export interface AssignMembersResult {
  added: string[];
  already: string[];
  missing: string[];
}

@Injectable({ providedIn: 'root' })
export class StaffLabelsService {
  async listLabels(): Promise<StaffLabel[]> {
    const { data: labels, error } = await supabase
      .from('staff_labels')
      .select('id, slug, name, description, is_system, portal_access')
      .order('name');
    if (error) throw new Error(error.message);

    const { data: perms, error: permError } = await supabase
      .from('staff_label_permissions')
      .select('label_id, permission_key');
    if (permError) throw new Error(permError.message);

    const { data: members, error: memberError } = await supabase
      .from('staff_label_members')
      .select('label_id');
    if (memberError) throw new Error(memberError.message);

    const permissionsByLabel = new Map<string, string[]>();
    for (const row of perms ?? []) {
      const list = permissionsByLabel.get(row.label_id) ?? [];
      list.push(row.permission_key);
      permissionsByLabel.set(row.label_id, list);
    }

    const counts = new Map<string, number>();
    for (const row of members ?? []) {
      counts.set(row.label_id, (counts.get(row.label_id) ?? 0) + 1);
    }

    return (labels ?? []).map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description ?? '',
      isSystem: row.is_system,
      portalAccess: row.portal_access,
      memberCount: counts.get(row.id) ?? 0,
      permissions: permissionsByLabel.get(row.id) ?? []
    }));
  }

  async createLabel(name: string, description: string, portalAccess: boolean): Promise<void> {
    const slug = slugify(name);
    if (!slug) throw new Error('Enter a label name');
    const { error } = await supabase.from('staff_labels').insert({
      slug,
      name: name.trim(),
      description: description.trim(),
      portal_access: portalAccess,
      is_system: false
    });
    if (error) throw new Error(error.message);
  }

  async updateLabel(label: StaffLabel, name: string, description: string, portalAccess: boolean): Promise<void> {
    const { error } = await supabase
      .from('staff_labels')
      .update({
        name: name.trim(),
        description: description.trim(),
        portal_access: label.isSystem ? label.portalAccess : portalAccess
      })
      .eq('id', label.id);
    if (error) throw new Error(error.message);
  }

  async deleteLabel(labelId: string): Promise<void> {
    const { error } = await supabase.from('staff_labels').delete().eq('id', labelId);
    if (error) throw new Error(error.message);
  }

  async savePermissions(labelId: string, keys: string[]): Promise<void> {
    const { data: existing, error: readError } = await supabase
      .from('staff_label_permissions')
      .select('permission_key')
      .eq('label_id', labelId);
    if (readError) throw new Error(readError.message);

    const current = new Set((existing ?? []).map((row) => row.permission_key as string));
    const next = new Set(keys);
    const toAdd = [...next].filter((key) => !current.has(key));
    const toRemove = [...current].filter((key) => !next.has(key));

    if (toRemove.length) {
      const { error } = await supabase
        .from('staff_label_permissions')
        .delete()
        .eq('label_id', labelId)
        .in('permission_key', toRemove);
      if (error) throw new Error(error.message);
    }

    if (toAdd.length) {
      const { error } = await supabase.from('staff_label_permissions').insert(
        toAdd.map((permission_key) => ({ label_id: labelId, permission_key }))
      );
      if (error) throw new Error(error.message);
    }
  }

  async listMembers(labelId: string): Promise<LabelMember[]> {
    const { data: memberships, error } = await supabase
      .from('staff_label_members')
      .select('user_id')
      .eq('label_id', labelId);
    if (error) throw new Error(error.message);
    const ids = (memberships ?? []).map((row) => row.user_id as string);
    if (!ids.length) return [];

    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', ids);
    if (profileError) throw new Error(profileError.message);

    return (profiles ?? [])
      .map((row) => ({
        userId: row.id as string,
        fullName: String(row.full_name ?? 'Unnamed'),
        email: String(row.email ?? '')
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  async assignEmails(labelId: string, emails: string[]): Promise<AssignMembersResult> {
    const unique = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
    if (!unique.length) return { added: [], already: [], missing: [] };

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, email')
      .in('email', unique);
    if (error) throw new Error(error.message);

    const byEmail = new Map<string, string>();
    for (const row of profiles ?? []) {
      if (row.email) byEmail.set(String(row.email).toLowerCase(), row.id as string);
    }

    const missing = unique.filter((email) => !byEmail.has(email));
    const foundIds = unique.filter((email) => byEmail.has(email)).map((email) => byEmail.get(email)!);

    const { data: existing, error: existingError } = await supabase
      .from('staff_label_members')
      .select('user_id')
      .eq('label_id', labelId)
      .in('user_id', foundIds.length ? foundIds : ['00000000-0000-0000-0000-000000000000']);
    if (existingError) throw new Error(existingError.message);

    const alreadyIds = new Set((existing ?? []).map((row) => row.user_id as string));
    const added: string[] = [];
    const already: string[] = [];
    const rows: { user_id: string; label_id: string }[] = [];

    for (const email of unique) {
      const userId = byEmail.get(email);
      if (!userId) continue;
      if (alreadyIds.has(userId)) already.push(email);
      else {
        added.push(email);
        rows.push({ user_id: userId, label_id: labelId });
      }
    }

    if (rows.length) {
      const { error: insertError } = await supabase.from('staff_label_members').insert(rows);
      if (insertError) throw new Error(insertError.message);
    }

    return { added, already, missing };
  }

  async removeMember(labelId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('staff_label_members')
      .delete()
      .eq('label_id', labelId)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
  }
}

function slugify(value: string): string {
  const base = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const suffix = Math.random().toString(36).slice(2, 6);
  return base ? `${base}-${suffix}` : '';
}
