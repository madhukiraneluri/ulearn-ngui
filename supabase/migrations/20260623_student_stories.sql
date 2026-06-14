-- Student stories + photo storage

CREATE TABLE public.student_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name text NOT NULL,
  photo_url text,
  college_name text NOT NULL,
  "current_role" text,
  impression text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX student_stories_published_sort_idx
  ON public.student_stories (is_published, sort_order);

CREATE TRIGGER student_stories_updated_at
  BEFORE UPDATE ON public.student_stories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_content_updated_at();

ALTER TABLE public.student_stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read published student stories" ON public.student_stories
  FOR SELECT TO public
  USING (is_published = true OR public.is_admin());

CREATE POLICY "Admin insert student stories" ON public.student_stories
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin update student stories" ON public.student_stories
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin delete student stories" ON public.student_stories
  FOR DELETE TO authenticated
  USING (public.is_admin());

INSERT INTO storage.buckets (id, name, public)
VALUES ('student-story-photos', 'student-story-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read student story photos" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'student-story-photos');

CREATE POLICY "Admin upload student story photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'student-story-photos' AND public.is_admin());

CREATE POLICY "Admin update student story photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'student-story-photos' AND public.is_admin());

CREATE POLICY "Admin delete student story photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'student-story-photos' AND public.is_admin());

INSERT INTO public.student_stories (student_name, college_name, "current_role", impression, sort_order)
VALUES
(
  'Rahul Menon',
  'Indian Institute of Technology Bombay',
  'Frontend Developer @ Zoho',
  'The mentors here genuinely care. I went from zero web dev knowledge to landing a ₹6 LPA role in 6 months. ULearn changed my life.',
  1
),
(
  'Priya Nair',
  'Vellore Institute of Technology',
  'ML Intern @ TCS Research',
  'The AI/ML research programme helped me co-author a paper. I never imagined that was possible as a college student. The mentors are incredible.',
  2
),
(
  'Arun Krishna',
  'RV College of Engineering',
  'Product Designer @ Freshworks',
  'I enrolled in the UI/UX course while in college and got placed before graduating. The portfolio projects made all the difference.',
  3
),
(
  'Divya Sharma',
  'National Institute of Technology Trichy',
  'Software Engineer @ Infosys',
  'ULearn''s structured curriculum and weekly mentor check-ins kept me accountable. I cracked my campus placement with confidence.',
  4
),
(
  'Karthik Reddy',
  'Birla Institute of Technology and Science Pilani',
  NULL,
  'The data analytics track gave me hands-on experience with real datasets. Recruiters loved seeing practical projects on my resume.',
  5
),
(
  'Meera Iyer',
  'Anna University',
  'UI/UX Designer @ Razorpay',
  'Design critiques from industry mentors sharpened my eye for detail. I built a portfolio that stood out in every interview.',
  6
),
(
  'Vikram Singh',
  'Delhi Technological University',
  'Backend Developer @ Flipkart',
  'From DSA basics to system design, every module felt relevant. The mock interviews prepared me better than any college workshop.',
  7
),
(
  'Ananya Gupta',
  'PES University',
  NULL,
  'I balanced my final-year exams with ULearn''s flexible schedule. The full-stack capstone project became my strongest talking point.',
  8
),
(
  'Rohan Desai',
  'Chandigarh University',
  'DevOps Engineer @ Amazon',
  'Cloud and CI/CD labs were production-grade. I transitioned from college projects to real infrastructure work seamlessly.',
  9
),
(
  'Sneha Patel',
  'International Institute of Information Technology Hyderabad',
  'AI Research Intern @ Google',
  'The research mentorship connected me with publishing opportunities. ULearn bridged the gap between coursework and cutting-edge AI.',
  10
);
