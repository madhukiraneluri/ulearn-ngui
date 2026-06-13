import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Album } from '../../models';

const MOCK_ALBUMS: Album[] = [
  {
    id: '1',
    title: 'Graduation Ceremony 2024',
    description: 'Celebrating our batch of 200+ students who completed their courses.',
    eventDate: '2024-03-15',
    createdAt: '2024-03-16',
    images: [
      { id: 'i1', url: 'assets/images/albums/grad1.jpg', caption: 'Opening ceremony', order: 1 },
      { id: 'i2', url: 'assets/images/albums/grad2.jpg', caption: 'Certificate distribution', order: 2 },
      { id: 'i3', url: 'assets/images/albums/grad3.jpg', caption: 'Group photo', order: 3 },
    ],
  },
  {
    id: '2',
    title: 'Web Dev Bootcamp — Jan 2024',
    description: '5-day intensive bootcamp with 80 students and 6 industry mentors.',
    eventDate: '2024-01-20',
    createdAt: '2024-01-21',
    images: [
      { id: 'i4', url: 'assets/images/albums/bootcamp1.jpg', caption: 'Kickoff session', order: 1 },
      { id: 'i5', url: 'assets/images/albums/bootcamp2.jpg', caption: 'Hackathon night', order: 2 },
    ],
  },
  {
    id: '3',
    title: 'Industry Mentor Meet — Dec 2023',
    description: 'Students met with mentors from Zoho, Freshworks, TCS, and Infosys.',
    eventDate: '2023-12-10',
    createdAt: '2023-12-11',
    images: [
      { id: 'i6', url: 'assets/images/albums/meet1.jpg', caption: 'Panel discussion', order: 1 },
      { id: 'i7', url: 'assets/images/albums/meet2.jpg', caption: 'Networking session', order: 2 },
    ],
  },
];

@Injectable({ providedIn: 'root' })
export class AlbumService {
  // SWAP LATER: return this.http.get<Album[]>(`${env.apiUrl}/albums`);
  getAlbums(): Observable<Album[]> {
    return of(MOCK_ALBUMS);
  }

  // SWAP LATER: return this.http.get<Album>(`${env.apiUrl}/albums/${id}`);
  getAlbumById(id: string): Observable<Album | null> {
    return of(MOCK_ALBUMS.find(a => a.id === id) ?? null);
  }
}