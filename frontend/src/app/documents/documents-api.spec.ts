import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL } from '../api-url';
import { DocumentsApi } from './documents-api';
import type { DocumentItem } from './document.model';

const API = 'http://localhost:3000';
const report: DocumentItem = {
  id: 'd1',
  name: 'Report.pdf',
  sizeBytes: 1234,
  createdAt: '2026-11-20T12:00:00.000Z',
};

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
    ],
  });
  return { api: TestBed.inject(DocumentsApi), http: TestBed.inject(HttpTestingController) };
}

describe('DocumentsApi', () => {
  it('lists the documents with GET /documents', async () => {
    const { api, http } = setup();

    const result = api.list();
    http.expectOne(`${API}/documents`).flush([report]);

    expect(await result).toEqual([report]);
  });

  it('asks for the link that opens a document with GET /documents/:id/view-url, and gives the url', async () => {
    const { api, http } = setup();

    const result = api.viewUrl('d1');
    http.expectOne(`${API}/documents/d1/view-url`).flush({ url: 'https://signed.example/read' });

    expect(await result).toBe('https://signed.example/read');
  });
});
