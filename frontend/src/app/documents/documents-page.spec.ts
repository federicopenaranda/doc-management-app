import { fireEvent, render, screen, waitFor, within } from '@testing-library/angular';
import { DocumentsApi } from './documents-api';
import type { DocumentItem } from './document.model';
import { DocumentsPage } from './documents-page';

const report: DocumentItem = {
  id: 'd1',
  name: 'Report Q3.pdf',
  sizeBytes: 2048,
  createdAt: '2026-11-20T12:00:00.000Z',
};
const photo: DocumentItem = { ...report, id: 'd2', name: 'Photo.png', sizeBytes: 3 * 1024 * 1024 };

async function setup(
  list: () => Promise<DocumentItem[]>,
  viewUrl: (id: string) => Promise<string> = async () => 'https://signed.example/read',
) {
  const api = { list: vi.fn(list), viewUrl: vi.fn(viewUrl) };
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  await render(DocumentsPage, { providers: [{ provide: DocumentsApi, useValue: api }] });
  return { api, open };
}

describe('DocumentsPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows a Documents heading and a Material table with Name, Size and Actions columns', async () => {
    await setup(async () => [report]);

    expect(screen.getByRole('heading', { name: /^documents$/i })).toBeTruthy();
    await screen.findByRole('table');
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.trim());
    expect(headers).toEqual(['Name', 'Size', 'Actions']);
  });

  it('shows one row per document with its original name and a readable size', async () => {
    await setup(async () => [report, photo]);

    const table = await screen.findByRole('table');

    const [, first, second] = within(table).getAllByRole('row');
    const cells = (row: HTMLElement) =>
      within(row)
        .getAllByRole('cell')
        .map((c) => c.textContent?.trim());
    expect(cells(first!).slice(0, 2)).toEqual(['Report Q3.pdf', '2.0 KB']);
    expect(cells(second!).slice(0, 2)).toEqual(['Photo.png', '3.0 MB']);
  });

  it('has a View action per row, named after the document, as the only action', async () => {
    await setup(async () => [report]);

    await screen.findByRole('table');

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'View Report Q3.pdf' })).toBeTruthy();
  });

  it('opens the original in a new tab, without giving the page to it, when View is clicked', async () => {
    const { api, open } = await setup(async () => [report]);
    await screen.findByRole('table');

    await fireEvent.click(screen.getByRole('button', { name: 'View Report Q3.pdf' }));

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith('https://signed.example/read', '_blank', 'noopener'),
    );
    expect(api.viewUrl).toHaveBeenCalledWith('d1');
  });

  it('says so when the document cannot be opened, and opens nothing', async () => {
    const { open } = await setup(
      async () => [report],
      async () => {
        throw new Error('404');
      },
    );
    await screen.findByRole('table');

    await fireEvent.click(screen.getByRole('button', { name: 'View Report Q3.pdf' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/could not open the document/i);
    expect(open).not.toHaveBeenCalled();
  });

  it('says there are no documents yet when the list is empty', async () => {
    await setup(async () => []);

    expect((await screen.findByRole('status')).textContent).toMatch(/no documents yet/i);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('says when the documents cannot be loaded, and loads them again on Try again', async () => {
    let fail = true;
    const { api } = await setup(async () => {
      if (fail) throw new Error('500');
      return [report];
    });

    expect((await screen.findByRole('alert')).textContent).toMatch(/could not load the documents/i);
    fail = false;
    await fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByRole('table')).toBeTruthy();
    expect(api.list).toHaveBeenCalledTimes(2);
  });
});
