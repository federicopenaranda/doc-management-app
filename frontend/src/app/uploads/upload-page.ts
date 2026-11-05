import { Component, computed, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { UploadStore } from './upload-store';

@Component({
  selector: 'dms-upload-page',
  imports: [MatButton, MatIcon, MatProgressBar],
  template: `
    <main class="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <h1 class="text-2xl font-medium" i18n>Upload documents</h1>

      <div
        data-testid="drop-zone"
        class="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-gray-500 p-10 text-center data-[dragging=true]:border-blue-700 data-[dragging=true]:bg-blue-50"
        [attr.data-dragging]="dragging()"
        (dragover)="onDragOver($event)"
        (dragleave)="dragging.set(false)"
        (drop)="onDrop($event)"
      >
        <mat-icon aria-hidden="true" fontIcon="upload_file" />
        <p i18n>Drag and drop files here, or</p>
        <button matButton="filled" type="button" (click)="picker.click()" i18n>Choose files</button>
        <input
          #picker
          data-testid="file-input"
          type="file"
          multiple
          hidden
          (change)="onPick(picker)"
        />
        <p class="text-sm text-gray-700" i18n>Up to 20 files at a time, 100 MB each.</p>
      </div>

      <p role="status" class="min-h-6">
        @if (total() > 0) {
          <ng-container i18n>{{ finished() }} of {{ total() }} finished</ng-container>
        }
      </p>

      @if (items().length > 0) {
        <ul class="flex flex-col gap-3" aria-label="Files" i18n-aria-label>
          @for (item of items(); track item.id) {
            <li class="flex flex-col gap-1 rounded border border-gray-300 p-3">
              <div class="flex items-center justify-between gap-3">
                <span class="font-medium break-all">{{ item.file.name }}</span>
                <span class="text-sm text-gray-700">{{ formatSize(item.file.size) }}</span>
              </div>

              @switch (item.status) {
                @case ('queued') {
                  <span i18n>Waiting</span>
                }
                @case ('uploading') {
                  <span i18n>Uploading</span>
                  <mat-progress-bar
                    mode="determinate"
                    [value]="item.progress"
                    [attr.aria-label]="item.file.name"
                  />
                }
                @case ('done') {
                  <span class="flex items-center gap-1 text-green-800">
                    <mat-icon aria-hidden="true" fontIcon="check_circle" />
                    <ng-container i18n>Uploaded</ng-container>
                  </span>
                }
                @case ('exists') {
                  <span class="flex items-center gap-1 text-amber-900">
                    <mat-icon aria-hidden="true" fontIcon="info" />
                    <ng-container i18n>A file with this name already exists</ng-container>
                  </span>
                }
                @case ('rejected') {
                  <span class="flex items-center gap-1 text-red-800">
                    <mat-icon aria-hidden="true" fontIcon="block" />
                    @switch (item.error) {
                      @case ('empty') {
                        <ng-container i18n>The file is empty</ng-container>
                      }
                      @case ('too-large') {
                        <ng-container i18n>The file is larger than 100 MB</ng-container>
                      }
                      @default {
                        <ng-container i18n>Only 20 files can be added at a time</ng-container>
                      }
                    }
                  </span>
                }
                @case ('failed') {
                  <span class="flex items-center gap-2 text-red-800">
                    <mat-icon aria-hidden="true" fontIcon="error" />
                    <ng-container i18n>The upload failed</ng-container>
                    <button
                      matButton
                      type="button"
                      [attr.aria-label]="'Retry ' + item.file.name"
                      (click)="retry(item.id)"
                      i18n
                    >
                      Retry
                    </button>
                  </span>
                }
              }
            </li>
          }
        </ul>
      }
    </main>
  `,
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

  protected retry(id: number): void {
    void this.store.retry(id);
  }

  protected formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
