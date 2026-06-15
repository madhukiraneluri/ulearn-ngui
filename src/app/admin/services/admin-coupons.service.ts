import { Injectable } from '@angular/core';
import { DiscountCoupon } from '../../models';
import { supabase } from '../../core/supabase.client';

export interface CouponInput {
  code: string;
  discountPercentage: number;
  active: boolean;
  expiresAt?: string | null;
  maxUses?: number | null;
}

@Injectable({ providedIn: 'root' })
export class AdminCouponsService {
  async listAll(): Promise<DiscountCoupon[]> {
    const { data, error } = await supabase
      .from('discount_coupons')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('AdminCouponsService.listAll:', error);
      return [];
    }

    return (data ?? []).map((row) => this.mapRow(row));
  }

  async create(input: CouponInput): Promise<DiscountCoupon | null> {
    const { data, error } = await supabase
      .from('discount_coupons')
      .insert({
        code: input.code.trim().toUpperCase(),
        discount_percentage: input.discountPercentage,
        active: input.active,
        expires_at: input.expiresAt || null,
        max_uses: input.maxUses ?? null
      })
      .select('*')
      .single();

    if (error) {
      console.error('AdminCouponsService.create:', error);
      return null;
    }

    return this.mapRow(data);
  }

  async delete(id: string): Promise<boolean> {
    const { error } = await supabase.from('discount_coupons').delete().eq('id', id);
    if (error) {
      console.error('AdminCouponsService.delete:', error);
      return false;
    }
    return true;
  }

  async toggleActive(id: string, active: boolean): Promise<boolean> {
    const { error } = await supabase
      .from('discount_coupons')
      .update({ active, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('AdminCouponsService.toggleActive:', error);
      return false;
    }
    return true;
  }

  private mapRow(row: Record<string, unknown>): DiscountCoupon {
    return {
      id: String(row['id']),
      code: String(row['code']),
      discountPercentage: Number(row['discount_percentage']),
      active: Boolean(row['active']),
      expiresAt: (row['expires_at'] as string) || undefined,
      maxUses: row['max_uses'] != null ? Number(row['max_uses']) : undefined,
      usageCount: Number(row['usage_count'] ?? 0),
      createdAt: String(row['created_at']),
      updatedAt: String(row['updated_at'])
    };
  }
}
