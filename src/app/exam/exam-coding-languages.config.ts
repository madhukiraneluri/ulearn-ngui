export interface ExamCodingLanguageOption {
  id: string;
  label: string;
  judge0Id: number;
}

/** Judge0 CE language IDs — keep in sync with exam-run-code / exam-evaluate edge functions. */
export const EXAM_CODING_LANGUAGES: ExamCodingLanguageOption[] = [
  { id: 'c', label: 'C (GCC 9.2)', judge0Id: 50 },
  { id: 'cpp', label: 'C++ (G++ 9.2)', judge0Id: 54 },
  { id: 'java', label: 'Java (OpenJDK 13)', judge0Id: 62 },
  { id: 'javascript', label: 'JavaScript (Node.js 12)', judge0Id: 63 },
  { id: 'python', label: 'Python 3.8', judge0Id: 71 }
];

export const DEFAULT_EXAM_CODING_LANGUAGE = 'javascript';

export function examCodingLanguageLabel(languageId: string): string {
  return EXAM_CODING_LANGUAGES.find((lang) => lang.id === languageId)?.label ?? languageId;
}

export function defaultStarterCode(languageId: string): string {
  switch (languageId) {
    case 'python':
      return `import sys

data = sys.stdin.read().strip().split()
a = int(data[0])
b = int(data[1])
print(a + b)`;
    case 'java':
      return `import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    int a = sc.nextInt();
    int b = sc.nextInt();
    System.out.println(a + b);
  }
}`;
    case 'c':
      return `#include <stdio.h>

int main() {
  int a, b;
  scanf("%d %d", &a, &b);
  printf("%d\\n", a + b);
  return 0;
}`;
    case 'cpp':
      return `#include <iostream>
using namespace std;

int main() {
  int a, b;
  cin >> a >> b;
  cout << a + b << endl;
  return 0;
}`;
    case 'javascript':
    default:
      return `const fs = require('fs');
const input = fs.readFileSync(0, 'utf8').trim().split(/\\s+/);
const a = Number(input[0]);
const b = Number(input[1]);
console.log(a + b);`;
  }
}
