import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-students',
  imports: [],
  templateUrl: './students.html',
  styleUrl: './students.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Students {}
