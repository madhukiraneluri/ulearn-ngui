-- Internships + research papers + thumbnail storage

CREATE TABLE public.internships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  type text NOT NULL CHECK (type IN ('short', 'long')),
  mode text NOT NULL CHECK (mode IN ('remote', 'hybrid', 'onsite')),
  domain text NOT NULL,
  description text NOT NULL,
  duration_label text NOT NULL,
  stipend_per_month int NOT NULL DEFAULT 0,
  has_ppo boolean NOT NULL DEFAULT false,
  skills text[] NOT NULL DEFAULT '{}',
  thumbnail_url text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.research_papers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  authors text[] NOT NULL DEFAULT '{}',
  abstract text NOT NULL,
  category text NOT NULL CHECK (category IN ('ai', 'nlp', 'cv', 'health', 'business')),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'under_review', 'preprint')),
  venue text NOT NULL,
  year int NOT NULL,
  pdf_url text,
  doi_url text,
  citations int NOT NULL DEFAULT 0,
  thumbnail_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX internships_type_status_idx ON public.internships(type, status);
CREATE INDEX research_papers_category_status_idx ON public.research_papers(category, status);

CREATE OR REPLACE FUNCTION public.set_content_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER internships_updated_at
  BEFORE UPDATE ON public.internships
  FOR EACH ROW
  EXECUTE FUNCTION public.set_content_updated_at();

CREATE TRIGGER research_papers_updated_at
  BEFORE UPDATE ON public.research_papers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_content_updated_at();

ALTER TABLE public.internships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_papers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read internships" ON public.internships
  FOR SELECT TO public
  USING (status = 'open' OR public.is_admin());

CREATE POLICY "Admin insert internships" ON public.internships
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin update internships" ON public.internships
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin delete internships" ON public.internships
  FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY "Public read research papers" ON public.research_papers
  FOR SELECT TO public
  USING (true);

CREATE POLICY "Admin insert research papers" ON public.research_papers
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin update research papers" ON public.research_papers
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin delete research papers" ON public.research_papers
  FOR DELETE TO authenticated
  USING (public.is_admin());

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('internship-thumbnails', 'internship-thumbnails', true),
  ('paper-thumbnails', 'paper-thumbnails', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read internship thumbnails" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'internship-thumbnails');

CREATE POLICY "Admin upload internship thumbnails" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'internship-thumbnails' AND public.is_admin());

CREATE POLICY "Admin update internship thumbnails" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'internship-thumbnails' AND public.is_admin());

CREATE POLICY "Admin delete internship thumbnails" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'internship-thumbnails' AND public.is_admin());

CREATE POLICY "Public read paper thumbnails" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'paper-thumbnails');

CREATE POLICY "Admin upload paper thumbnails" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'paper-thumbnails' AND public.is_admin());

CREATE POLICY "Admin update paper thumbnails" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'paper-thumbnails' AND public.is_admin());

CREATE POLICY "Admin delete paper thumbnails" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'paper-thumbnails' AND public.is_admin());

-- Seed internships (from former mock data)
INSERT INTO public.internships (title, type, mode, domain, description, duration_label, stipend_per_month, has_ppo, skills, status)
VALUES
(
  'Frontend Development Internship', 'short', 'remote', 'Technical',
  'Work on real React/Angular projects with a product team. Build features used by thousands of users.',
  '6 Weeks', 5000, false, ARRAY['React', 'TypeScript', 'CSS', 'Git'], 'open'
),
(
  'UI/UX Design Internship', 'short', 'hybrid', 'Design',
  'Design real product screens, conduct user research, and build a portfolio of production-ready work.',
  '8 Weeks', 6000, false, ARRAY['Figma', 'User Research', 'Prototyping', 'Design Systems'], 'open'
),
(
  'Digital Marketing Internship', 'short', 'remote', 'Marketing',
  'Run real ad campaigns, manage social media, and analyse growth metrics for a real product.',
  '6 Weeks', 4500, false, ARRAY['Google Ads', 'Meta Ads', 'SEO', 'Analytics'], 'open'
),
(
  'Machine Learning Engineer Intern', 'long', 'hybrid', 'AI/ML',
  'Build and deploy ML models in production. Work alongside senior engineers on real AI products.',
  '12 Months', 15000, true, ARRAY['Python', 'TensorFlow', 'PyTorch', 'MLOps', 'SQL'], 'open'
),
(
  'Cloud & DevOps Intern', 'long', 'hybrid', 'Technical',
  'Set up CI/CD pipelines, manage AWS infrastructure, and automate deployments for production systems.',
  '6 Months', 12000, true, ARRAY['AWS', 'Docker', 'Kubernetes', 'Jenkins', 'Terraform'], 'open'
),
(
  'React Native App Dev Intern', 'long', 'remote', 'Technical',
  'Build cross-platform mobile apps from scratch. Ship features to the App Store and Play Store.',
  '9 Months', 10000, false, ARRAY['React Native', 'JavaScript', 'Redux', 'REST APIs'], 'open'
);

-- Seed research papers (from former mock data)
INSERT INTO public.research_papers (title, authors, abstract, category, status, venue, year, citations, pdf_url, doi_url)
VALUES
(
  'Attention-Based Transformer Architecture for Multi-Label Text Classification in Low-Resource Languages',
  ARRAY['Dr. Sreejith P.', 'Meera Iyer', 'Arun S.'],
  'We propose a novel transformer variant that achieves state-of-the-art performance on Malayalam and Tamil text classification benchmarks, reducing annotation requirements by 60%.',
  'ai', 'published', 'IEEE ICASSP 2024', 2024, 42, null, null
),
(
  'Real-Time Diabetic Retinopathy Detection Using Lightweight CNN Architectures on Edge Devices',
  ARRAY['Dr. Priya R.', 'Rahul K.', 'Nair S.'],
  'A compressed MobileNet variant enabling diabetic retinopathy screening directly on mobile devices with 94.2% accuracy and 30ms inference latency.',
  'cv', 'published', 'MICCAI 2024', 2024, 38, null, null
),
(
  'Cross-Lingual Sentiment Transfer for Dravidian Language Family Using Adversarial Domain Adaptation',
  ARRAY['Meera Iyer', 'Dr. Sreejith P.'],
  'Demonstrates effective zero-shot sentiment analysis transfer across Dravidian languages by exploiting shared morphological structures through adversarial training.',
  'nlp', 'published', 'ACL 2023', 2023, 67, null, null
),
(
  'Federated Learning for Privacy-Preserving Clinical Decision Support in Rural Healthcare Centres',
  ARRAY['Dr. Anil Kumar', 'Divya M.', 'Priya N.'],
  'A federated framework enabling collaborative ML model training across 15 rural health centres without sharing sensitive patient data, achieving 89% diagnostic accuracy.',
  'health', 'published', 'NeurIPS Workshop 2023', 2023, 29, null, null
),
(
  'Curriculum Learning Strategies for Sample-Efficient Reinforcement Learning in Robotic Manipulation Tasks',
  ARRAY['Dr. Sreejith P.', 'Rohan D.'],
  'We introduce a difficulty-aware curriculum that reduces sample complexity by 45% on standard robotic manipulation benchmarks while improving generalisation to novel objects.',
  'ai', 'published', 'ICML 2024', 2024, 21, null, null
),
(
  'Instruction-Tuned LLMs for Automated Educational Content Generation in STEM Domains',
  ARRAY['Meera Iyer', 'Arun S.', 'Dr. Priya R.'],
  'Fine-tuning methodology for generating pedagogically sound STEM educational content — evaluated by 40 educators across India with 87% quality approval rate.',
  'nlp', 'under_review', 'EDM 2024', 2024, 0, null, null
);
