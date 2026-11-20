import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_URL } from '../api-url';
import type { DocumentItem } from './document.model';

@Service()
export class DocumentsApi {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  /** The documents of the client of the logged-in user, newest first. */
  list(): Promise<DocumentItem[]> {
    return firstValueFrom(this.http.get<DocumentItem[]>(`${this.apiUrl}/documents`));
  }

  /** A link that opens the original for 15 minutes. Rejects with the HttpErrorResponse (404: not a document of the client). */
  async viewUrl(id: string): Promise<string> {
    const { url } = await firstValueFrom(
      this.http.get<{ url: string }>(`${this.apiUrl}/documents/${id}/view-url`),
    );
    return url;
  }
}
