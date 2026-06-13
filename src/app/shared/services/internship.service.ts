import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Internship, InternshipType } from '../../models';

const MOCK_INTERNSHIPS: Internship[] = [
  {
    id: '1', title: 'Frontend Development Internship',
    type: 'short', mode: 'remote', domain: 'Technical',
    description: 'Work on real React/Angular projects with a product team. Build features used by thousands of users.',
    durationLabel: '6 Weeks', stipendPerMonth: 5000,
    hasPPO: false, status: 'open',
    skills: ['React', 'TypeScript', 'CSS', 'Git'],
    createdAt: '2024-01-01',
  },
  {
    id: '2', title: 'UI/UX Design Internship',
    type: 'short', mode: 'hybrid', domain: 'Design',
    description: 'Design real product screens, conduct user research, and build a portfolio of production-ready work.',
    durationLabel: '8 Weeks', stipendPerMonth: 6000,
    hasPPO: false, status: 'open',
    skills: ['Figma', 'User Research', 'Prototyping', 'Design Systems'],
    createdAt: '2024-01-01',
  },
  {
    id: '3', title: 'Digital Marketing Internship',
    type: 'short', mode: 'remote', domain: 'Marketing',
    description: 'Run real ad campaigns, manage social media, and analyse growth metrics for a live product.',
    durationLabel: '6 Weeks', stipendPerMonth: 4500,
    hasPPO: false, status: 'open',
    skills: ['Google Ads', 'Meta Ads', 'SEO', 'Analytics'],
    createdAt: '2024-01-01',
  },
  {
    id: '4', title: 'Machine Learning Engineer Intern',
    type: 'long', mode: 'hybrid', domain: 'AI/ML',
    description: 'Build and deploy ML models in production. Work alongside senior engineers on real AI products.',
    durationLabel: '12 Months', stipendPerMonth: 15000,
    hasPPO: true, status: 'open',
    skills: ['Python', 'TensorFlow', 'PyTorch', 'MLOps', 'SQL'],
    createdAt: '2024-01-01',
  },
  {
    id: '5', title: 'Cloud & DevOps Intern',
    type: 'long', mode: 'hybrid', domain: 'Technical',
    description: 'Set up CI/CD pipelines, manage AWS infrastructure, and automate deployments for production systems.',
    durationLabel: '6 Months', stipendPerMonth: 12000,
    hasPPO: true, status: 'open',
    skills: ['AWS', 'Docker', 'Kubernetes', 'Jenkins', 'Terraform'],
    createdAt: '2024-01-01',
  },
  {
    id: '6', title: 'React Native App Dev Intern',
    type: 'long', mode: 'remote', domain: 'Technical',
    description: 'Build cross-platform mobile apps from scratch. Ship features to the App Store and Play Store.',
    durationLabel: '9 Months', stipendPerMonth: 10000,
    hasPPO: false, status: 'open',
    skills: ['React Native', 'JavaScript', 'Redux', 'REST APIs'],
    createdAt: '2024-01-01',
  },
];

@Injectable({ providedIn: 'root' })
export class InternshipService {
  // SWAP LATER: return this.http.get<Internship[]>(`${env.apiUrl}/internships`);
  getInternships(): Observable<Internship[]> {
    return of(MOCK_INTERNSHIPS);
  }

  // SWAP LATER: return this.http.get<Internship[]>(`${env.apiUrl}/internships?type=${type}`);
  getInternshipsByType(type: InternshipType): Observable<Internship[]> {
    return of(MOCK_INTERNSHIPS.filter(i => i.type === type));
  }

  // SWAP LATER: return this.http.get<Internship>(`${env.apiUrl}/internships/${id}`);
  getInternshipById(id: string): Observable<Internship | null> {
    return of(MOCK_INTERNSHIPS.find(i => i.id === id) ?? null);
  }
}