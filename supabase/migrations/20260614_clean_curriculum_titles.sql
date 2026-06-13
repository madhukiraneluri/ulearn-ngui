-- Normalize module and lesson titles: Module N instead of Week N, topic-only lesson titles

UPDATE course_curriculum
SET title = regexp_replace(title, '^Week\s*(\d+)', 'Module \1', 'i')
WHERE title ~* '^Week\s*\d+';

UPDATE course_lessons
SET title = trim(regexp_replace(title, '^(?:Live\s+)?Class\s*\d+\s*[:\-–—]?\s*', '', 'i'))
WHERE title ~* '^(?:Live\s+)?Class\s*\d+';
