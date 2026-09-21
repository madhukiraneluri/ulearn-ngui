export interface ExamPublicTestResult {
  input: string;
  expectedOutput: string;
  actualOutput: string;
  passed: boolean;
  stderr?: string;
  compileOutput?: string;
}
