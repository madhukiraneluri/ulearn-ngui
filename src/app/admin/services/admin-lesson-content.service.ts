import { Injectable } from '@angular/core';
import { ContentBlock, ContentBlockType } from '../../models';
import { supabase } from '../../core/supabase.client';

export interface BlockInput {
  type: ContentBlockType;
  content: Record<string, unknown>;
  orderIndex: number;
}

export interface BlockUpdate {
  type?: ContentBlockType;
  content?: Record<string, unknown>;
  orderIndex?: number;
}

@Injectable({ providedIn: 'root' })
export class AdminLessonContentService {
  async getBlocksForLesson(lessonId: string): Promise<ContentBlock[]> {
    const { data, error } = await supabase
      .from('content_blocks')
      .select('id, type, order_index, content')
      .eq('lesson_id', lessonId)
      .order('order_index', { ascending: true });

    if (error) {
      console.error('AdminLessonContentService.getBlocksForLesson:', error);
      return [];
    }

    return (data ?? []).map((row) => this.mapBlock(row as Record<string, unknown>));
  }

  async createBlock(lessonId: string, input: BlockInput): Promise<ContentBlock | null> {
    const { data, error } = await supabase
      .from('content_blocks')
      .insert({
        lesson_id: lessonId,
        type: input.type,
        content: input.content,
        order_index: input.orderIndex
      })
      .select('id, type, order_index, content')
      .single();

    if (error) {
      console.error('AdminLessonContentService.createBlock:', error);
      throw new Error(error.message);
    }

    return this.mapBlock(data as Record<string, unknown>);
  }

  async updateBlock(blockId: string, input: BlockUpdate): Promise<ContentBlock | null> {
    const payload: Record<string, unknown> = {};
    if (input.type != null) payload['type'] = input.type;
    if (input.content != null) payload['content'] = input.content;
    if (input.orderIndex != null) payload['order_index'] = input.orderIndex;

    const { data, error } = await supabase
      .from('content_blocks')
      .update(payload)
      .eq('id', blockId)
      .select('id, type, order_index, content')
      .single();

    if (error) {
      console.error('AdminLessonContentService.updateBlock:', error);
      throw new Error(error.message);
    }

    return this.mapBlock(data as Record<string, unknown>);
  }

  async deleteBlock(blockId: string): Promise<boolean> {
    const { error } = await supabase.from('content_blocks').delete().eq('id', blockId);
    if (error) {
      console.error('AdminLessonContentService.deleteBlock:', error);
      return false;
    }
    return true;
  }

  async reorderBlocks(lessonId: string, orderedBlockIds: string[]): Promise<boolean> {
    const updates = orderedBlockIds.map((id, index) =>
      supabase.from('content_blocks').update({ order_index: index }).eq('id', id)
    );

    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      console.error('AdminLessonContentService.reorderBlocks:', failed.error);
      return false;
    }
    return true;
  }

  defaultContentForType(type: ContentBlockType): Record<string, unknown> {
    switch (type) {
      case 'heading':
        return { text: 'New heading', level: 'h2' };
      case 'text':
        return { html: '<p>Enter your text here.</p>' };
      case 'image':
        return { imageUrl: '', caption: '', alignment: 'center' };
      case 'callout':
        return { icon: '💡', text: 'Important note', color: 'yellow' };
      case 'code':
        return { language: 'typescript', code: '// your code here' };
      case 'quote':
        return { text: 'Quote text', author: '' };
      case 'video':
        return { videoUrl: '' };
      case 'gallery':
        return { images: [], columns: 2 };
      case 'two_column':
        return {
          left: { type: 'text', html: '<p>Left column</p>' },
          right: { type: 'text', html: '<p>Right column</p>' }
        };
      case 'divider':
        return {};
      default:
        return {};
    }
  }

  blockTypeLabel(type: ContentBlockType): string {
    const labels: Record<ContentBlockType, string> = {
      heading: 'Heading',
      text: 'Text',
      image: 'Image',
      two_column: 'Two column',
      callout: 'Callout',
      code: 'Code',
      quote: 'Quote',
      divider: 'Divider',
      gallery: 'Gallery',
      video: 'Video'
    };
    return labels[type] ?? type;
  }

  private mapBlock(raw: Record<string, unknown>): ContentBlock {
    return {
      id: String(raw['id']),
      type: raw['type'] as ContentBlockType,
      orderIndex: Number(raw['order_index']),
      content: (raw['content'] as Record<string, unknown>) ?? {}
    };
  }
}
