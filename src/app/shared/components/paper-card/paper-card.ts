import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-paper-card',
  imports: [],
  templateUrl: './paper-card.html',
  styleUrl: './paper-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaperCard {}
