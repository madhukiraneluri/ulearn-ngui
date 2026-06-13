import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-albums-management',
  imports: [],
  templateUrl: './albums-management.html',
  styleUrl: './albums-management.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlbumsManagement {}
