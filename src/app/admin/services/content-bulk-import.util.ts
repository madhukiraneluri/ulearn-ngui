import { ContentBlockType } from '../../models';

export interface BulkContentBlockInput {
  order: number;
  type: ContentBlockType;
  content: Record<string, unknown>;
}

export interface BulkContentPayload {
  contentBlocks: BulkContentBlockInput[];
}

export interface BulkContentImportResult {
  path: string;
  success: boolean;
  message: string;
}

const VALID_BLOCK_TYPES: ContentBlockType[] = [
  'heading',
  'text',
  'image',
  'two_column',
  'callout',
  'code',
  'quote',
  'divider',
  'gallery',
  'video'
];

export const SAMPLE_CONTENT_JSON: BulkContentPayload = {
  contentBlocks: [
    {
      order: 1,
      type: 'heading',
      content: { text: 'What is Machine Learning?', level: 'h2' }
    },
    {
      order: 2,
      type: 'text',
      content: {
        html: '<p>Machine learning is a branch of artificial intelligence where systems learn patterns from data instead of being explicitly programmed for every rule.</p>'
      }
    },
    {
      order: 3,
      type: 'callout',
      content: {
        icon: '💡',
        text: 'Supervised, unsupervised, and reinforcement learning are the three main paradigms.',
        color: 'yellow'
      }
    },
    {
      order: 4,
      type: 'heading',
      content: { text: 'Types of Machine Learning', level: 'h3' }
    },
    {
      order: 5,
      type: 'text',
      content: {
        html: '<p><strong>Supervised learning</strong> uses labeled examples. <strong>Unsupervised learning</strong> finds structure in unlabeled data.</p>'
      }
    },
    {
      order: 6,
      type: 'code',
      content: {
        language: 'python',
        code: '# Example: load a dataset\nimport pandas as pd\ndf = pd.read_csv("data.csv")'
      }
    },
    {
      order: 7,
      type: 'quote',
      content: {
        text: 'The goal is to turn data into information, and information into insight.',
        author: 'Carly Fiorina'
      }
    }
  ]
};

export const BLOCK_TYPE_REFERENCE = [
  { type: 'heading', shape: '{ "text": string, "level": "h1" | "h2" | "h3" }' },
  { type: 'text', shape: '{ "html": string }' },
  { type: 'callout', shape: '{ "icon": string, "text": string, "color": "yellow" | "blue" | "green" | "red" }' },
  { type: 'code', shape: '{ "language": string, "code": string }' },
  { type: 'quote', shape: '{ "text": string, "author"?: string }' },
  { type: 'image', shape: '{ "imageUrl": string, "caption"?: string, "alignment"?: "center" }' },
  { type: 'video', shape: '{ "videoUrl": string }' },
  { type: 'divider', shape: '{}' },
  { type: 'gallery', shape: '{ "images": [{ "imageUrl": string, "caption"?: string }], "columns": 2 }' },
  { type: 'two_column', shape: '{ "left": { "type": "text", "html": string }, "right": { "type": "text", "html": string } }' }
];

export interface ContentPromptOptions {
  lessonTitle: string;
  contentTheme: string;
}

export function buildContentChatbotPrompt(options: ContentPromptOptions): string {
  return `You are helping create lesson content for ULearn LMS.

Before sending this prompt to a chatbot, replace the placeholders below:
- **LESSON_TITLE** → your lesson name (currently: ${options.lessonTitle})
- **CONTENT_THEME** → the topic to teach (currently: ${options.contentTheme})

---

Lesson title: **LESSON_TITLE**
Content theme / topic: **CONTENT_THEME**

Generate ONLY a valid JSON object — no markdown fences, no text before or after.

## Required JSON shape
{
  "contentBlocks": [
    {
      "order": 1,
      "type": "heading | text | callout | code | quote | image | video | divider | gallery | two_column",
      "content": { }
    }
  ]
}

## Rules
1. Create 5–10 contentBlocks with varied types (heading, text, callout, code, quote).
2. First block: heading (h2) using the lesson title.
3. Write educational content matching **CONTENT_THEME**.
4. Use simple HTML in text blocks: <p>, <strong>, <ul>, <li>.
5. "order" starts at 1 and increments.

## content shape per type
${BLOCK_TYPE_REFERENCE.map((b) => `- ${b.type}: ${b.shape}`).join('\n')}

Output the complete JSON now.`;
}

export function parseBulkContentJson(raw: string): {
  payload: BulkContentPayload | null;
  error?: string;
} {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');

  if (!trimmed) {
    return { payload: null, error: 'Paste JSON content blocks.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { payload: null, error: 'Invalid JSON. Check commas, quotes, and brackets.' };
  }

  return validateBulkContentPayload(parsed);
}

function validateBulkContentPayload(raw: unknown): {
  payload: BulkContentPayload | null;
  error?: string;
} {
  let blocksRaw: unknown[];

  if (Array.isArray(raw)) {
    blocksRaw = raw;
  } else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (!Array.isArray(obj['contentBlocks'])) {
      return { payload: null, error: '"contentBlocks" must be a non-empty array.' };
    }
    blocksRaw = obj['contentBlocks'];
  } else {
    return { payload: null, error: 'JSON must be an object with "contentBlocks" or a blocks array.' };
  }

  if (blocksRaw.length === 0) {
    return { payload: null, error: 'At least one content block is required.' };
  }

  const contentBlocks: BulkContentBlockInput[] = [];

  for (let i = 0; i < blocksRaw.length; i++) {
    const item = blocksRaw[i];
    if (!item || typeof item !== 'object') {
      return { payload: null, error: `Block ${i + 1}: must be an object.` };
    }
    const b = item as Record<string, unknown>;
    const type = String(b['type'] ?? '').trim() as ContentBlockType;

    if (!VALID_BLOCK_TYPES.includes(type)) {
      return {
        payload: null,
        error: `Block ${i + 1}: invalid type "${type}".`
      };
    }

    const content = b['content'];
    if (content != null && typeof content !== 'object') {
      return { payload: null, error: `Block ${i + 1}: "content" must be an object.` };
    }

    contentBlocks.push({
      order: Number(b['order']) || i + 1,
      type,
      content: (content as Record<string, unknown>) ?? {}
    });
  }

  contentBlocks.sort((a, b) => a.order - b.order);
  return { payload: { contentBlocks } };
}

export function downloadSampleContentJson(filename?: string): void {
  const json = JSON.stringify(SAMPLE_CONTENT_JSON, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? 'ulearn-lesson-content-sample.json';
  a.click();
  URL.revokeObjectURL(url);
}
