import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminInternshipsService } from '../services/admin-internships.service';
import {
  AdminInternshipApplicationsService,
  InternshipApplicationSummary
} from '../services/admin-internship-applications.service';
import { InternshipApplicationStatus } from '../../models';
import { ToastService } from '../../core/services/toast';

@Component({
  selector: 'app-internship-applications-management',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './internship-applications-management.html',
  styleUrl: './internship-applications-management.scss'
})
export class InternshipApplicationsManagement implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly internshipsService = inject(AdminInternshipsService);
  private readonly applicationsService = inject(AdminInternshipApplicationsService);
  private readonly toast = inject(ToastService);

  readonly internships = signal<{ id: string; title: string }[]>([]);
  readonly selectedInternshipId = signal<string | 'all'>('all');
  readonly summary = signal<InternshipApplicationSummary | null>(null);
  readonly allApplications = signal<InternshipApplicationSummary['applications']>([]);
  readonly isLoading = signal(true);
  readonly updatingId = signal<string | null>(null);

  readonly statusOptions: InternshipApplicationStatus[] = [
    'applied',
    'reviewing',
    'accepted',
    'rejected'
  ];

  ngOnInit(): void {
    void this.initPage();
  }

  private async initPage(): Promise<void> {
    this.isLoading.set(true);
    const list = await this.internshipsService.listAll();
    this.internships.set(list.map((i) => ({ id: i.id, title: i.title })));

    const qp = this.route.snapshot.queryParamMap.get('internshipId');
    const initial: string | 'all' =
      qp && list.some((i) => i.id === qp) ? qp : 'all';
    this.selectedInternshipId.set(initial);
    await this.loadApplications(initial, list);
    this.isLoading.set(false);
  }

  async onInternshipChange(event: Event): Promise<void> {
    const value = (event.target as HTMLSelectElement).value;
    const id: string | 'all' = value === 'all' ? 'all' : value;
    this.selectedInternshipId.set(id);
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { internshipId: id === 'all' ? null : id },
      queryParamsHandling: 'merge'
    });
    await this.loadApplications(id);
  }

  private async loadApplications(
    internshipId: string | 'all',
    internshipList?: { id: string; title: string }[]
  ): Promise<void> {
    const list = internshipList ?? this.internships();

    if (internshipId === 'all') {
      const rows = await this.applicationsService.listAll();
      this.allApplications.set(rows);
      this.summary.set(null);
      return;
    }

    const title = list.find((i) => i.id === internshipId)?.title ?? 'Internship';
    const data = await this.applicationsService.getApplicationsForInternship(
      internshipId,
      title
    );
    this.summary.set(data);
    this.allApplications.set([]);
  }

  async onStatusChange(
    applicationId: string,
    event: Event
  ): Promise<void> {
    const status = (event.target as HTMLSelectElement).value as InternshipApplicationStatus;
    this.updatingId.set(applicationId);
    const ok = await this.applicationsService.updateStatus(applicationId, status);
    this.updatingId.set(null);

    if (ok) {
      this.toast.success('Status updated');
      await this.loadApplications(this.selectedInternshipId());
    } else {
      this.toast.error('Could not update status');
    }
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return iso;
    }
  }

  formatStatus(status: InternshipApplicationStatus): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }
}
