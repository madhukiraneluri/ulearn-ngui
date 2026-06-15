import { Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { ValidateCouponResult } from '../../models';
import { supabase } from '../../core/supabase.client';

@Injectable({ providedIn: 'root' })
export class CouponService {
  validateCoupon(code: string): Observable<ValidateCouponResult> {
    return from(
      supabase.rpc('validate_coupon', { p_code: code.trim() })
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('validate_coupon error:', error);
          return { valid: false, message: 'Could not validate coupon' };
        }
        const raw = data as Record<string, unknown> | null;
        if (!raw) {
          return { valid: false, message: 'Invalid coupon code' };
        }
        return {
          valid: Boolean(raw['valid']),
          discountPercentage:
            raw['discount_percentage'] != null
              ? Number(raw['discount_percentage'])
              : undefined,
          message: String(raw['message'] ?? 'Invalid coupon code')
        };
      }),
      catchError((err) => {
        console.error('CouponService.validateCoupon:', err);
        return [{ valid: false, message: 'Could not validate coupon' }];
      })
    );
  }
}
