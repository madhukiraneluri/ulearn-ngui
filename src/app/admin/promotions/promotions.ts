import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { invokeAuthedFunction, supabase } from '../../core/supabase.client';
import { ToastService } from '../../core/services/toast';
import { extractEmails, readEmailFile } from '../labels/labels-management';

type TextBlock = { id: string; type: 'text'; text: string };
type ImageBlock = { id: string; type: 'image'; url: string; alt: string };
type ContentBlock = TextBlock | ImageBlock;

interface MailAttachment {
  filename: string;
  contentBase64: string;
}

@Component({
  selector: 'app-promotions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './promotions.html',
  styleUrl: './promotions.scss'
})
export class Promotions {
  private readonly toast = inject(ToastService);

  readonly blocks = signal<ContentBlock[]>([{ id: crypto.randomUUID(), type: 'text', text: '' }]);
  readonly recipients = signal<string[]>([]);
  readonly attachmentNames = signal<string[]>([]);
  readonly isSending = signal(false);
  readonly isUploading = signal(false);

  subject = '';
  oneEmail = '';
  private attachments: MailAttachment[] = [];

  addTextBlock(afterId?: string): void {
    this.insertAfter(afterId, { id: crypto.randomUUID(), type: 'text', text: '' });
  }

  async addImage(event: Event, afterId?: string): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.toast.error('Choose an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.toast.error('Images must be 5 MB or smaller');
      return;
    }

    this.isUploading.set(true);
    try {
      const path = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '')}`;
      const { error } = await supabase.storage.from('promotion-assets').upload(path, file, {
        contentType: file.type,
        upsert: false
      });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from('promotion-assets').getPublicUrl(path);
      this.insertAfter(afterId, {
        id: crypto.randomUUID(),
        type: 'image',
        url: data.publicUrl,
        alt: file.name
      });
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Could not upload image');
    } finally {
      this.isUploading.set(false);
    }
  }

  updateText(id: string, text: string): void {
    this.blocks.update((blocks) => blocks.map((block) => (
      block.id === id && block.type === 'text' ? { ...block, text } : block
    )));
  }

  removeBlock(id: string): void {
    this.blocks.update((blocks) => blocks.filter((block) => block.id !== id));
  }

  addOneEmail(): void {
    const emails = extractEmails(this.oneEmail);
    if (!emails.length) {
      this.toast.error('Enter a valid email');
      return;
    }
    this.addRecipients(emails);
    this.oneEmail = '';
  }

  addPasted(value: string): void {
    const emails = extractEmails(value);
    if (!emails.length) {
      this.toast.error('No email addresses found');
      return;
    }
    this.addRecipients(emails);
  }

  async onEmailFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const text = await readEmailFile(file);
    const emails = extractEmails(text);
    if (!emails.length) {
      this.toast.error('No email addresses found in that file');
      return;
    }
    this.addRecipients(emails);
  }

  removeRecipient(email: string): void {
    this.recipients.update((list) => list.filter((item) => item !== email));
  }

  async onAttachment(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    for (const file of files) {
      if (this.attachments.length >= 3) {
        this.toast.error('You can attach up to 3 files');
        break;
      }
      if (file.size > 1_500_000) {
        this.toast.error(`${file.name} is over 1.5 MB`);
        continue;
      }
      const contentBase64 = await fileToBase64(file);
      this.attachments.push({ filename: file.name, contentBase64 });
    }
    this.attachmentNames.set(this.attachments.map((file) => file.filename));
  }

  removeAttachment(filename: string): void {
    this.attachments = this.attachments.filter((file) => file.filename !== filename);
    this.attachmentNames.set(this.attachments.map((file) => file.filename));
  }

  async send(): Promise<void> {
    const subject = this.subject.trim();
    const emails = this.recipients();
    const blocks = this.blocks()
      .filter((block) => block.type === 'image' || block.text.trim())
      .map((block) => block.type === 'text'
        ? { type: 'text' as const, text: block.text.trim() }
        : { type: 'image' as const, url: block.url, alt: block.alt });

    if (!subject) {
      this.toast.error('Enter a subject');
      return;
    }
    if (!blocks.length) {
      this.toast.error('Add some content');
      return;
    }
    if (!emails.length) {
      this.toast.error('Add at least one email');
      return;
    }
    if (emails.length > 100) {
      this.toast.error('Send to 100 addresses at a time');
      return;
    }
    if (this.attachments.length && emails.length > 20) {
      this.toast.error('With attachments, send to 20 addresses at a time');
      return;
    }

    this.isSending.set(true);
    try {
      const { data, error } = await invokeAuthedFunction<{
        sent?: number;
        failed?: { email: string; error: string }[];
        error?: string;
      }>('send-promotion-email', {
        subject,
        blocks,
        emails,
        attachments: this.attachments
      });
      if (error) throw new Error(await readFunctionError(error));
      if (data?.error) throw new Error(data.error);
      const failed = data?.failed?.length ?? 0;
      this.toast.success(`Sent ${data?.sent ?? 0} email${data?.sent === 1 ? '' : 's'}${failed ? `. ${failed} failed.` : '.'}`);
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Could not send');
    } finally {
      this.isSending.set(false);
    }
  }

  private insertAfter(afterId: string | undefined, block: ContentBlock): void {
    this.blocks.update((blocks) => {
      if (!afterId) return [...blocks, block];
      const index = blocks.findIndex((item) => item.id === afterId);
      if (index < 0) return [...blocks, block];
      return [...blocks.slice(0, index + 1), block, ...blocks.slice(index + 1)];
    });
  }

  private addRecipients(emails: string[]): void {
    const merged = new Set([...this.recipients(), ...emails]);
    this.recipients.set([...merged]);
    this.toast.success(`${emails.length} email${emails.length === 1 ? '' : 's'} added`);
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? '');
      resolve(value.slice(value.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

async function readFunctionError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* ignore */
    }
  }
  return error instanceof Error ? error.message : 'Request failed';
}
