import { Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import type { LoadState } from '../shared/load-state.model';
import { formatSize } from '../shared/file-size';
import { DocumentsApi } from './documents-api';
import type { DocumentItem } from './document.model';

@Component({
  selector: 'dms-documents-page',
  imports: [MatButton, MatIcon, MatTableModule],
  templateUrl: './documents-page.html',
})
export class DocumentsPage {
  private readonly api = inject(DocumentsApi);

  protected readonly columns = ['name', 'size', 'actions'];
  protected readonly formatSize = formatSize;
  protected readonly state = signal<LoadState>('loading');
  protected readonly documents = signal<DocumentItem[]>([]);
  /** Set while a View request runs: only one at a time. */
  protected readonly busy = signal(false);
  protected readonly viewError = signal(false);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.documents.set(await this.api.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Opens the original in a new tab through a link that lasts 15 minutes. */
  protected async view(document: DocumentItem): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.viewError.set(false);
    try {
      window.open(await this.api.viewUrl(document.id), '_blank', 'noopener');
    } catch {
      this.viewError.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  /** Who the button is about, for screen readers. */
  protected viewLabel(document: DocumentItem): string {
    return $localize`:@@documents.view-aria:View ${document.name}:name:`;
  }
}
