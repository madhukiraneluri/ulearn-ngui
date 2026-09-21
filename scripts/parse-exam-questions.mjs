import fs from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

const ROOT = path.resolve('scripts/exam-questions-import/5 roles screening test questions');

const ROLE_FILES = {
  'research-analyst': {
    mcq: '2 Technical roles file/ULearn_Research_Analyst_Top_30_Technical_Questions.docx',
    coding: '2 Technical roles file/ULearn_Research_Analyst_Coding_Assessment.docx'
  },
  'junior-full-stack-developer': {
    mcq: '2 Technical roles file/ULearn_Junior_Full_Stack_Technical_Screening_Test.docx',
    coding: '2 Technical roles file/ULearn_Junior_Full_Stack_Developer_Coding_Assessment.docx'
  },
  'business-development-executive': {
    mcq: '3 - non technical roles/Business development executive.pdf'
  },
  'associate-lead-generation-specialist': {
    mcq: '3 - non technical roles/associate lead generation specalist test.pdf'
  },
  'relationship-executive': {
    mcq: '3 - non technical roles/relationship executive.pdf'
  }
};

/** Curated answer key for Associate Lead Generation (source PDF has no key). */
const ASSOCIATE_ANSWER_KEY = {
  1: 'A', 2: 'B', 3: 'B', 4: 'B', 5: 'B', 6: 'B', 7: 'C', 8: 'B', 9: 'A', 10: 'B',
  11: 'A', 12: 'D', 13: 'B', 14: 'B', 15: 'A', 16: 'B', 17: 'B', 18: 'B', 19: 'B', 20: 'B',
  21: 'B', 22: 'B', 23: 'B', 24: 'B', 25: 'B', 26: 'B', 27: 'B', 28: 'B', 29: 'C', 30: 'B',
  31: 'B', 32: 'B', 33: 'B', 34: 'A', 35: 'B', 36: 'B', 37: 'B', 38: 'A', 39: 'A', 40: 'C'
};

async function readDocx(relPath) {
  const { value } = await mammoth.extractRawText({ path: path.join(ROOT, relPath) });
  return value.replace(/\r/g, '');
}

async function readPdf(relPath) {
  const buffer = await fs.readFile(path.join(ROOT, relPath));
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  return result.text.replace(/\r/g, '');
}

function letterToIndex(letter) {
  return letter.toUpperCase().charCodeAt(0) - 65;
}

function parseAnswerKey(text, slug) {
  if (slug === 'associate-lead-generation-specialist') {
    const map = {};
    for (const [num, letter] of Object.entries(ASSOCIATE_ANSWER_KEY)) {
      map[Number(num)] = letterToIndex(letter);
    }
    return map;
  }

  const keySection = text.split(/answer key/i).pop() ?? '';
  const map = {};

  for (const match of keySection.matchAll(/(\d+)\.\s*([A-Da-d])\b/g)) {
    map[Number(match[1])] = letterToIndex(match[2]);
  }

  for (const match of keySection.matchAll(/(?:^|\n)\s*(\d+)\s*\n\s*([A-Da-d])\s*(?=\n|\d|$)/gm)) {
    const num = Number(match[1]);
    if (num >= 1 && num <= 40) {
      map[num] = letterToIndex(match[2]);
    }
  }

  return map;
}

function parseMcqs(text, answerKey) {
  const body = text.split(/answer key/i)[0] ?? text;
  const normalized = body
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '\n')
    .replace(/\u0000/g, '')
    .replace(/\n{2,}/g, '\n');

  const questions = [];
  const blocks = normalized.split(/\n(?=\d+\.\s+)/);

  for (const block of blocks) {
    const trimmed = block.trim();
    const head = trimmed.match(/^(\d+)\.\s*(.+?)(?:\n|$)/s);
    if (!head) continue;

    const number = Number(head[1]);
    const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
    let stem = head[2].trim();
    const options = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^section\s+/i.test(line)) continue;

      const opt = line.match(/^([A-Da-d])[\).:\-]\s*(.+)$/);
      if (opt) {
        options.push(opt[2].replace(/\s+/g, ' ').trim());
        continue;
      }

      if (options.length === 0 && !/^(\d+)\./.test(line)) {
        stem += ` ${line}`;
      }
    }

    if (options.length < 2) continue;

    const correctIndex =
      answerKey[number] !== undefined
        ? Math.min(Math.max(answerKey[number], 0), options.length - 1)
        : 0;

    questions.push({
      number,
      stem: stem.replace(/\s+/g, ' ').trim(),
      options,
      correctIndex
    });
  }

  return questions.sort((a, b) => a.number - b.number);
}

function parseCodingQuestions(text) {
  const blocks = text.split(/Question\s+(\d+)\s*[–-]/i).slice(1);
  const questions = [];

  for (let i = 0; i < blocks.length; i += 2) {
    const number = Number(blocks[i]);
    const body = blocks[i + 1] ?? '';
    const levelMatch = body.match(/^([^]*?)(?=Problem Statement:)/i);
    const level = levelMatch ? levelMatch[1].trim() : 'Coding';

    const problemMatch = body.match(/Problem Statement:\s*([\s\S]*?)(?=Input:|Reference Solution)/i);
    const inputMatch = body.match(/Input:\s*([\s\S]*?)(?=Expected Output:|Reference Solution)/i);
    const outputMatch = body.match(/Expected Output:\s*([\s\S]*?)(?=Reference Solution|Skills Tested|$)/i);

    const title = body.split('\n')[0]?.trim() || `Coding Question ${number}`;
    const description = problemMatch?.[1]?.replace(/\s+/g, ' ').trim() ?? title;
    const sampleInput = inputMatch?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
    const sampleOutput = outputMatch?.[1]?.replace(/\s+/g, ' ').trim() ?? '';

    questions.push({
      number,
      level,
      title: `Question ${number} – ${level.replace(/\n/g, ' ').trim()}`,
      description,
      sampleInput,
      sampleOutput
    });
  }

  return questions;
}

function buildCodingPayload(roleSlug, parsed) {
  if (roleSlug === 'research-analyst') {
    return [
      {
        title: 'Mean Imputation (Missing Values)',
        description:
          `${parsed[0]?.description ?? 'Replace missing values with the mean.'}\n\n` +
          'Read comma-separated tokens from stdin. An empty token or NONE means missing. ' +
          'Print comma-separated values with each missing token replaced by the mean of the numeric values (use one decimal place when needed).',
        language: 'python',
        marks: 10,
        starterCode: `import sys\n\ntokens = [t.strip() for t in sys.stdin.read().strip().split(',')]\nvalues = [float(t) for t in tokens if t and t.upper() != 'NONE']\nmean = sum(values) / len(values)\nresult = []\nfor t in tokens:\n    if not t or t.upper() == 'NONE':\n        result.append(f'{mean:.1f}' if mean % 1 else str(int(mean)))\n    else:\n        result.append(t)\nprint(','.join(result))`,
        publicTestCases: [
          { input: '10,20,,30,,40', expectedOutput: '10,20,25.0,30,25.0,40' },
          { input: '5,NONE,15', expectedOutput: '5,10.0,15' }
        ],
        hiddenTestCases: [
          { input: '100,,200,,', expectedOutput: '100,150.0,200,150.0' },
          { input: 'NONE,4,8', expectedOutput: '6.0,4,8' }
        ]
      },
      {
        title: 'Student Performance Summary',
        description:
          `${parsed[1]?.description ?? 'Analyze student records.'}\n\n` +
          'Read a JSON array of students from stdin (fields: name, marks, hours). Print exactly four lines:\n' +
          'Average Marks: <value>\nHighest Scorer: <name>\nStudents scoring 75 or above: <comma-separated names>\n' +
          'Average Marks of students studying more than 5 hours: <value rounded to 2 decimals>',
        language: 'python',
        marks: 10,
        starterCode: `import sys, json\n\nstudents = json.loads(sys.stdin.read().strip())\navg = sum(s['marks'] for s in students) / len(students)\nprint(f"Average Marks: {avg}")\nhighest = max(students, key=lambda s: s['marks'])\nprint(f"Highest Scorer: {highest['name']}")\nqualified = [s['name'] for s in students if s['marks'] >= 75]\nprint("Students scoring 75 or above: " + ", ".join(qualified))\nhigh = [s['marks'] for s in students if s['hours'] > 5]\nprint(f"Average Marks of students studying more than 5 hours: {round(sum(high)/len(high), 2)}")`,
        publicTestCases: [
          {
            input:
              '[{"name":"Rahul","marks":85,"hours":6},{"name":"Priya","marks":72,"hours":4},{"name":"Arjun","marks":91,"hours":7},{"name":"Sneha","marks":68,"hours":3},{"name":"Kiran","marks":78,"hours":6}]',
            expectedOutput:
              'Average Marks: 78.8\nHighest Scorer: Arjun\nStudents scoring 75 or above: Rahul, Arjun, Kiran\nAverage Marks of students studying more than 5 hours: 84.67'
          }
        ],
        hiddenTestCases: [
          {
            input:
              '[{"name":"A","marks":80,"hours":6},{"name":"B","marks":90,"hours":2},{"name":"C","marks":76,"hours":7}]',
            expectedOutput:
              'Average Marks: 82.0\nHighest Scorer: B\nStudents scoring 75 or above: A, B, C\nAverage Marks of students studying more than 5 hours: 83.0'
          }
        ]
      }
    ];
  }

  if (roleSlug === 'junior-full-stack-developer') {
    return [
      {
        title: 'Print Duplicate Elements Once',
        description:
          `${parsed[0]?.description ?? 'Print duplicate elements once.'}\n\n` +
          'Read space-separated integers from stdin and print duplicate values once, in ascending order, separated by spaces.',
        language: 'python',
        marks: 10,
        starterCode: `import sys\n\narr = list(map(int, sys.stdin.read().split()))\nseen, dups = set(), set()\nfor n in arr:\n    if n in seen:\n        dups.add(n)\n    else:\n        seen.add(n)\nprint(' '.join(map(str, sorted(dups))))`,
        publicTestCases: [
          { input: '2 5 3 2 8 5 9', expectedOutput: '2 5' },
          { input: '1 1 1 2', expectedOutput: '1' }
        ],
        hiddenTestCases: [
          { input: '4 4 3 3 2', expectedOutput: '3 4' },
          { input: '10 20 30', expectedOutput: '' }
        ]
      },
      {
        title: 'Active Adult Users',
        description:
          `${parsed[1]?.description ?? 'Filter active users aged 18+.'}\n\n` +
          'Read a JSON array of users from stdin (name, age, active). Print each matching name on its own line in input order.',
        language: 'python',
        marks: 10,
        starterCode: `import sys, json\n\nusers = json.loads(sys.stdin.read().strip())\nfor u in users:\n    if u['active'] and u['age'] >= 18:\n        print(u['name'])`,
        publicTestCases: [
          {
            input:
              '[{"name":"Rahul","age":21,"active":true},{"name":"Priya","age":17,"active":true},{"name":"Arjun","age":25,"active":false},{"name":"Sneha","age":20,"active":true},{"name":"Kiran","age":16,"active":false}]',
            expectedOutput: 'Rahul\nSneha'
          }
        ],
        hiddenTestCases: [
          {
            input: '[{"name":"A","age":18,"active":true},{"name":"B","age":30,"active":false}]',
            expectedOutput: 'A'
          }
        ]
      }
    ];
  }

  return [];
}

function sqlEscape(value) {
  return String(value).replace(/'/g, "''");
}

function jsonSql(value) {
  return `'${sqlEscape(JSON.stringify(value))}'::jsonb`;
}

async function buildSeedSql(roleData) {
  const chunks = [
    '-- Seed screening questions for all 5 recruitment roles',
    'BEGIN;',
    ''
  ];

  for (const [slug, data] of Object.entries(roleData)) {
    chunks.push(`-- ${slug}`);
    chunks.push(`DO $$`);
    chunks.push(`DECLARE`);
    chunks.push(`  v_role_id uuid;`);
    chunks.push(`BEGIN`);
    chunks.push(`  SELECT er.id INTO v_role_id`);
    chunks.push(`  FROM public.exam_roles er`);
    chunks.push(`  JOIN public.exams e ON e.id = er.exam_id`);
    chunks.push(`  WHERE e.recruitment_slug = '${sqlEscape(slug)}' AND er.slug = '${sqlEscape(slug)}';`);
    chunks.push(`  IF v_role_id IS NULL THEN`);
    chunks.push(`    RAISE EXCEPTION 'Role not found: ${sqlEscape(slug)}';`);
    chunks.push(`  END IF;`);
    chunks.push(`  DELETE FROM public.exam_questions WHERE exam_role_id = v_role_id;`);

    let sortOrder = 0;
    for (const mcq of data.mcqs) {
      const payload = {
        stem: mcq.stem,
        options: mcq.options,
        correctIndex: mcq.correctIndex,
        marks: 1
      };
      chunks.push(
        `  INSERT INTO public.exam_questions (exam_role_id, type, sort_order, payload) VALUES (v_role_id, 'mcq', ${sortOrder}, ${jsonSql(payload)});`
      );
      sortOrder++;
    }

    for (const coding of data.coding) {
      chunks.push(
        `  INSERT INTO public.exam_questions (exam_role_id, type, sort_order, payload) VALUES (v_role_id, 'coding', ${sortOrder}, ${jsonSql(coding)});`
      );
      sortOrder++;
    }

    chunks.push(`END $$;`);
    chunks.push('');
  }

  chunks.push('COMMIT;');
  return chunks.join('\n');
}

async function main() {
  const roleData = {};

  for (const [slug, files] of Object.entries(ROLE_FILES)) {
    const entry = { mcqs: [], coding: [] };

    if (files.mcq) {
      const text = files.mcq.endsWith('.pdf') ? await readPdf(files.mcq) : await readDocx(files.mcq);
      const answerKey = parseAnswerKey(text, slug);
      entry.mcqs = parseMcqs(text, answerKey);
    }

    let parsedCoding = [];
    if (files.coding) {
      const text = await readDocx(files.coding);
      parsedCoding = parseCodingQuestions(text);
      entry.coding = buildCodingPayload(slug, parsedCoding);
    }

    roleData[slug] = entry;
    console.log(
      `${slug}: ${entry.mcqs.length} MCQs, ${entry.coding.length} coding (answers mapped: ${entry.mcqs.filter((q) => q.correctIndex > 0).length}/${entry.mcqs.length} non-A)`
    );
  }

  await fs.writeFile(
    'scripts/exam-questions-import/parsed-questions.json',
    JSON.stringify(roleData, null, 2)
  );

  const sql = await buildSeedSql(roleData);
  await fs.writeFile('supabase/migrations/20260921_seed_recruitment_questions.sql', sql);
  console.log('Wrote supabase/migrations/20260921_seed_recruitment_questions.sql');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
