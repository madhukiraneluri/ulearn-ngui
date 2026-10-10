import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import { ToastService } from '../../core/services/toast';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import {
  LabelMember,
  StaffLabel,
  StaffLabelsService
} from '../services/staff-labels.service';
import { permissionGroups } from './staff-permissions';

@Component({
  selector: 'app-labels-management',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './labels-management.html',
  styleUrl: './labels-management.scss'
})
export class LabelsManagement implements OnInit {
  private readonly labelsService = inject(StaffLabelsService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly groups = permissionGroups();
  readonly labels = signal<StaffLabel[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly members = signal<LabelMember[]>([]);
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);

  newName = '';
  newDescription = '';
  newPortalAccess = true;

  editName = '';
  editDescription = '';
  editPortalAccess = true;
  selectedPermissions = new Set<string>();

  memberEmail = '';
  bulkText = '';

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  selected(): StaffLabel | undefined {
    return this.labels().find((label) => label.id === this.selectedId());
  }

  async reload(): Promise<void> {
    this.isLoading.set(true);
    try {
      const labels = await this.labelsService.listLabels();
      this.labels.set(labels);
      const current = this.selectedId();
      const next = labels.find((label) => label.id === current) ?? labels[0];
      if (next) await this.selectLabel(next);
      else this.selectedId.set(null);
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Could not load labels');
    } finally {
      this.isLoading.set(false);
    }
  }

  async selectLabel(label: StaffLabel): Promise<void> {
    this.selectedId.set(label.id);
    this.editName = label.name;
    this.editDescription = label.description;
    this.editPortalAccess = label.portalAccess;
    this.selectedPermissions = new Set(label.permissions);
    try {
      this.members.set(await this.labelsService.listMembers(label.id));
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Could not load members');
    }
  }

  togglePermission(key: string, checked: boolean): void {
    if (checked) this.selectedPermissions.add(key);
    else this.selectedPermissions.delete(key);
  }

  hasPermission(key: string): boolean {
    return this.selectedPermissions.has(key);
  }

  async addLabel(): Promise<void> {
    if (!this.newName.trim()) {
      this.toast.error('Enter a label name');
      return;
    }
    this.isSaving.set(true);
    try {
      await this.labelsService.createLabel(this.newName, this.newDescription, this.newPortalAccess);
      this.newName = '';
      this.newDescription = '';
      this.newPortalAccess = true;
      this.toast.success('Label added');
      await this.reload();
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Could not add label');
    } finally {
      this.isSaving.set(false);
    }
  }

  async saveLabel(): Promise<void> {
    const label = this.selected();
    if (!label) return;
    this.isSaving.set(true);
    try {
      await this.labelsService.updateLabel(label, this.editName, this.editDescription, this.editPortalAccess);
      await this.labelsService.savePermissions(label.id, [...this.selectedPermissions]);
      this.toast.success('Label saved');
      await this.reload();
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Could not save label');
    } finally {
      this.isSaving.set(false);
    }
  }

  async deleteLabel(): Promise<void> {
    const label = this.selected();
    if (!label || label.isSystem) return;
    const confirmed = await this.confirmDialog.confirm({
      title: 'Delete label',
      message: `Delete "${label.name}"? Members lose the screens this label granted.`,
      confirmLabel: 'Delete',
      variant: 'danger'
    });
    if (!confirmed) return;
    try {
      await this.labelsService.deleteLabel(label.id);
      this.selectedId.set(null);
      this.toast.success('Label deleted');
      await this.reload();
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Could not delete label');
    }
  }

  async addOneMember(): Promise<void> {
    const label = this.selected();
    if (!label || !this.memberEmail.trim()) return;
    await this.assign(label.id, [this.memberEmail]);
    this.memberEmail = '';
  }

  async addBulkMembers(): Promise<void> {
    const label = this.selected();
    if (!label) return;
    const emails = extractEmails(this.bulkText);
    if (!emails.length) {
      this.toast.error('No email addresses found');
      return;
    }
    await this.assign(label.id, emails);
    this.bulkText = '';
  }

  async onMemberFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const text = await readEmailFile(file);
    const emails = extractEmails(text);
    const label = this.selected();
    if (!label) return;
    if (!emails.length) {
      this.toast.error('No email addresses found in that file');
      return;
    }
    await this.assign(label.id, emails);
  }

  async removeMember(member: LabelMember): Promise<void> {
    const label = this.selected();
    if (!label) return;
    try {
      await this.labelsService.removeMember(label.id, member.userId);
      this.members.set(this.members().filter((row) => row.userId !== member.userId));
      this.toast.success('Member removed');
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Could not remove member');
    }
  }

  private async assign(labelId: string, emails: string[]): Promise<void> {
    this.isSaving.set(true);
    try {
      const result = await this.labelsService.assignEmails(labelId, emails);
      const parts = [`Added ${result.added.length}`];
      if (result.already.length) parts.push(`${result.already.length} already on this label`);
      if (result.missing.length) parts.push(`${result.missing.length} have no account`);
      this.toast.success(parts.join('. ') + '.');
      this.members.set(await this.labelsService.listMembers(labelId));
      this.labels.set(await this.labelsService.listLabels());
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Could not add members');
    } finally {
      this.isSaving.set(false);
    }
  }
}

export function extractEmails(value: string): string[] {
  const found = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return [...new Set(found.map((email) => email.toLowerCase()))];
}

export async function readEmailFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const data = await file.arrayBuffer();
    const book = XLSX.read(data, { type: 'array' });
    const sheet = book.Sheets[book.SheetNames[0]];
    return XLSX.utils.sheet_to_csv(sheet);
  }
  return file.text();
}
