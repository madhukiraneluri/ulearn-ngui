import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-albums',
  imports: [],
  templateUrl: './albums.html',
  styleUrl: './albums.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Albums {}
