// Run this script with: node ./scripts/seed_courses.js
// Updates course metadata including hours_per_class for seeded slugs.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://yllfccuxohnipleyseup.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pf-nQHMOf19pvY_jjYnA-A_pEXhs0JI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function seed() {
  try {
    const courses = [
      {
        slug: 'intro-to-ml',
        title: 'Intro to Machine Learning',
        live_class_count: 22,
        hours_per_class: 2,
        course_format: '45-day',
        duration_days: 45,
        total_lessons: 22
      },
      {
        slug: 'web-dev-101',
        title: 'Web Development 101',
        live_class_count: 24,
        hours_per_class: 1.5,
        course_format: '3-month',
        weekly_hours: 12,
        total_lessons: 24
      },
      {
        slug: 'research-methods',
        title: 'Research Methods',
        live_class_count: 22,
        hours_per_class: 2,
        course_format: '45-day',
        duration_days: 45,
        total_lessons: 22
      }
    ];

    for (const course of courses) {
      const { slug, ...fields } = course;
      const { error } = await supabase.from('courses').update(fields).eq('slug', slug);
      if (error) {
        console.error(`Seed error for ${slug}:`, error);
        process.exit(1);
      }
    }

    console.log('Seed completed for', courses.map((c) => c.slug).join(', '));
    process.exit(0);
  } catch (err) {
    console.error('Unexpected error', err);
    process.exit(1);
  }
}

seed();
