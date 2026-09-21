import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-exam-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink],
  templateUrl: './exam-layout.html',
  styleUrl: './exam-layout.scss'
})
export class ExamLayout {
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);

  async logout(): Promise<void> {
    await this.auth.signOut('/exam/login');
    await this.router.navigate(['/exam/login']);
  }
}
