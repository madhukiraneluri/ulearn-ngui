export interface StudentProvisionInput {
  email: string;
  fullName: string;
  phone?: string;
  collegeName?: string;
}

export interface NewBatchProvisionInput {
  courseId: string;
  name: string;
  startDate?: string;
  endDate?: string;
  status?: 'active' | 'completed' | 'archived';
}

export interface CreateStudentsPayload {
  students: StudentProvisionInput[];
  courseIds?: string[];
  batchIds?: string[];
  newBatch?: NewBatchProvisionInput | null;
  sendEmail?: boolean;
}

export interface CreateStudentRowResult {
  rowNumber: number;
  email: string;
  success: boolean;
  message: string;
  userId?: string;
  tempPassword?: string;
  emailSent?: boolean;
}

export interface CreateStudentsResponse {
  results: CreateStudentRowResult[];
  summary: { total: number; success: number; failed: number };
}

export const BULK_STUDENT_HEADERS = ['email', 'full_name', 'phone', 'college'] as const;

export const BULK_STUDENT_HELP = [
  'Required columns: email, full_name.',
  'Optional: phone, college.',
  'One student per row.',
  'Duplicate emails in the file or existing accounts will be marked as failed.'
];

export const SAMPLE_STUDENT_ROW = {
  email: 'student@college.edu',
  full_name: 'Student Name',
  phone: '9876543210',
  college: 'Aditya Degree College - Kakinada'
};

export function parseStudentRows(rows: Record<string, unknown>[]): {
  students: Array<StudentProvisionInput & { rowNumber: number }>;
  error?: string;
} {
  const students: Array<StudentProvisionInput & { rowNumber: number }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const email = String(row['email'] ?? row['Email'] ?? '').trim().toLowerCase();
    const fullName = String(row['full_name'] ?? row['fullName'] ?? row['name'] ?? row['Name'] ?? '').trim();
    const phone = String(row['phone'] ?? row['Phone'] ?? '').trim();
    const collegeName = String(row['college'] ?? row['college_name'] ?? row['College'] ?? '').trim();

    if (!email && !fullName) continue;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { students: [], error: `Row ${i + 2}: invalid email` };
    }
    if (!fullName) {
      return { students: [], error: `Row ${i + 2}: full_name is required` };
    }

    students.push({
      rowNumber: i + 2,
      email,
      fullName,
      phone: phone || undefined,
      collegeName: collegeName || undefined
    });
  }

  if (students.length === 0) {
    return { students: [], error: 'No student rows found.' };
  }

  return { students };
}
