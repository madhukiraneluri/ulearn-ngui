import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { ResearchPaper, PaperCategory } from '../../models';

const MOCK_PAPERS: ResearchPaper[] = [
  {
    id: '1', category: 'ai',
    title: 'Attention-Based Transformer Architecture for Multi-Label Text Classification in Low-Resource Languages',
    authors: ['Dr. Sreejith P.', 'Meera Iyer', 'Arun S.'],
    abstract: 'We propose a novel transformer variant that achieves state-of-the-art performance on Malayalam and Tamil text classification benchmarks, reducing annotation requirements by 60%.',
    status: 'published', venue: 'IEEE ICASSP 2024', year: 2024,
    citations: 42, createdAt: '2024-03-01',
    pdfUrl: '#', doiUrl: '#',
  },
  {
    id: '2', category: 'cv',
    title: 'Real-Time Diabetic Retinopathy Detection Using Lightweight CNN Architectures on Edge Devices',
    authors: ['Dr. Priya R.', 'Rahul K.', 'Nair S.'],
    abstract: 'A compressed MobileNet variant enabling diabetic retinopathy screening directly on mobile devices with 94.2% accuracy and 30ms inference latency.',
    status: 'published', venue: 'MICCAI 2024', year: 2024,
    citations: 38, createdAt: '2024-02-01',
    pdfUrl: '#', doiUrl: '#',
  },
  {
    id: '3', category: 'nlp',
    title: 'Cross-Lingual Sentiment Transfer for Dravidian Language Family Using Adversarial Domain Adaptation',
    authors: ['Meera Iyer', 'Dr. Sreejith P.'],
    abstract: 'Demonstrates effective zero-shot sentiment analysis transfer across Dravidian languages by exploiting shared morphological structures through adversarial training.',
    status: 'published', venue: 'ACL 2023', year: 2023,
    citations: 67, createdAt: '2023-06-01',
    pdfUrl: '#', doiUrl: '#',
  },
  {
    id: '4', category: 'health',
    title: 'Federated Learning for Privacy-Preserving Clinical Decision Support in Rural Healthcare Centres',
    authors: ['Dr. Anil Kumar', 'Divya M.', 'Priya N.'],
    abstract: 'A federated framework enabling collaborative ML model training across 15 rural health centres without sharing sensitive patient data, achieving 89% diagnostic accuracy.',
    status: 'published', venue: 'NeurIPS Workshop 2023', year: 2023,
    citations: 29, createdAt: '2023-12-01',
    pdfUrl: '#', doiUrl: '#',
  },
  {
    id: '5', category: 'ai',
    title: 'Curriculum Learning Strategies for Sample-Efficient Reinforcement Learning in Robotic Manipulation Tasks',
    authors: ['Dr. Sreejith P.', 'Rohan D.'],
    abstract: 'We introduce a difficulty-aware curriculum that reduces sample complexity by 45% on standard robotic manipulation benchmarks while improving generalisation to novel objects.',
    status: 'published', venue: 'ICML 2024', year: 2024,
    citations: 21, createdAt: '2024-05-01',
    pdfUrl: '#', doiUrl: '#',
  },
  {
    id: '6', category: 'nlp',
    title: 'Instruction-Tuned LLMs for Automated Educational Content Generation in STEM Domains',
    authors: ['Meera Iyer', 'Arun S.', 'Dr. Priya R.'],
    abstract: 'Fine-tuning methodology for generating pedagogically sound STEM educational content — evaluated by 40 educators across India with 87% quality approval rate.',
    status: 'under_review', venue: 'EDM 2024', year: 2024,
    citations: 0, createdAt: '2024-07-01',
    pdfUrl: '#', doiUrl: '#',
  },
];

@Injectable({ providedIn: 'root' })
export class PaperService {
  // SWAP LATER: return this.http.get<ResearchPaper[]>(`${env.apiUrl}/papers`);
  getPapers(): Observable<ResearchPaper[]> {
    return of(MOCK_PAPERS);
  }

  // SWAP LATER: return this.http.get<ResearchPaper[]>(`${env.apiUrl}/papers?category=${cat}`);
  getPapersByCategory(category: PaperCategory): Observable<ResearchPaper[]> {
    return of(MOCK_PAPERS.filter(p => p.category === category));
  }

  // SWAP LATER: return this.http.get<ResearchPaper[]>(`${env.apiUrl}/papers/featured`);
  getFeaturedPapers(): Observable<ResearchPaper[]> {
    return of(MOCK_PAPERS.slice(0, 3));
  }
}