import { Component, inject, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AdminDashboardService } from '../services/admin-dashboard.service';
import { DashboardStats } from '../../models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard implements OnInit {
  private readonly dashboardService = inject(AdminDashboardService);

  readonly stats = signal<DashboardStats | null>(null);
  readonly isLoading = signal(true);

  ngOnInit(): void {
    void this.loadStats();
  }

  private async loadStats(): Promise<void> {
    this.isLoading.set(true);
    const data = await this.dashboardService.getStats();
    this.stats.set(data);
    this.isLoading.set(false);
  }

  formatRevenue(amount: number): string {
    return '₹' + amount.toLocaleString('en-IN');
  }
}
