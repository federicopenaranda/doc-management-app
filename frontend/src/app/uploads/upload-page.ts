import { Component, computed, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { UploadStore } from './upload-store';

@Component({
  selector: 'dms-upload-page',
  imports: [MatButton, MatIcon, MatProgressBar],
  templateUrl: './upload-page.html',
})
export class UploadPage {
  private readonly store = inject(UploadStore);

  protected readonly items = this.store.items;
  protected readonly dragging = signal(false);
  protected readonly total = computed(() => this.items().length);
  protected readonly finished = computed(
    () => this.items().filter((i) => !['queued', 'uploading'].includes(i.status)).length,
  );

  protected onDragOver(event: DragEvent): void {
    event.preventDefault(); // without this the browser refuses the drop
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    void this.store.add(Array.from(event.dataTransfer?.files ?? []));
  }

  protected onPick(input: HTMLInputElement): void {
    void this.store.add(Array.from(input.files ?? []));
    input.value = ''; // lets the same file be picked again
  }

  protected retryLabel(name: string): string {
    return $localize`:@@upload.retry-aria:Retry ${name}:name:`;
  }

  protected retry(id: number): void {
    void this.store.retry(id);
  }

  protected formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
