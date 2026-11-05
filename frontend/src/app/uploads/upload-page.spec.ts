import { render, screen, fireEvent, within } from '@testing-library/angular';
import { PUT_FILE, UploadApi, type SignedUpload } from './upload-api';
import { UploadPage } from './upload-page';

interface PendingPut {
  name: string;
  resolve: (status: number) => void;
}

async function setup() {
  const puts: PendingPut[] = [];
  const sign = vi.fn((file: File): Promise<SignedUpload> =>
    Promise.resolve({ name: file.name, url: `https://signed/${file.name}`, headers: {} }),
  );
  const put = vi.fn(
    (_url: string, _headers: Record<string, string>, file: Blob) =>
      new Promise<number>((resolve) => puts.push({ name: (file as File).name, resolve })),
  );
  const view = await render(UploadPage, {
    providers: [
      { provide: UploadApi, useValue: { sign } },
      { provide: PUT_FILE, useValue: put },
    ],
  });
  const dropZone = screen.getByTestId('drop-zone');
  const drop = (...files: File[]) => fireEvent.drop(dropZone, { dataTransfer: { files } });
  return { view, puts, sign, dropZone, drop };
}

const file = (name: string, content = 'x') => new File([content], name, { type: 'text/plain' });

describe('UploadPage', () => {
  it('shows a heading, the drop area and a button to choose files', async () => {
    await setup();

    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
    expect(screen.getByRole('button', { name: /choose files/i })).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('marks the drop area while files are dragged over it', async () => {
    const { dropZone } = await setup();

    fireEvent.dragOver(dropZone);
    expect(dropZone.getAttribute('data-dragging')).toBe('true');

    fireEvent.dragLeave(dropZone);
    expect(dropZone.getAttribute('data-dragging')).toBe('false');
  });

  it('lists dropped files, uploads them and shows when they are done', async () => {
    const { drop, puts } = await setup();

    drop(file('a.txt'), file('b.txt'));

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText('a.txt')).toBeTruthy();
    await vi.waitFor(() => expect(puts).toHaveLength(2));
    expect(within(items[0]!).getByText(/uploading/i)).toBeTruthy();

    puts[0]!.resolve(200);
    puts[1]!.resolve(200);

    await vi.waitFor(() => expect(screen.getAllByText(/uploaded/i).length).toBeGreaterThan(1));
    expect(screen.getByRole('status').textContent).toMatch(/2 of 2/);
  });

  it('adds the files picked with the file input', async () => {
    await setup();
    const input = screen.getByTestId('file-input') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file('picked.txt')] } });

    expect(await screen.findByText('picked.txt')).toBeTruthy();
  });

  it('tells the user when a file name already exists and does not offer a retry', async () => {
    const { drop, puts } = await setup();
    drop(file('dup.txt'));
    await vi.waitFor(() => expect(puts).toHaveLength(1));

    puts[0]!.resolve(412);

    expect(await screen.findByText(/already exists/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });

  it('shows rejected files with the reason', async () => {
    const { drop } = await setup();

    drop(new File([], 'empty.txt'));

    expect(await screen.findByText(/the file is empty/i)).toBeTruthy();
  });

  it('offers a retry for a failed file and uploads it again', async () => {
    const { drop, puts, sign } = await setup();
    drop(file('a.txt'));
    await vi.waitFor(() => expect(puts).toHaveLength(1));
    puts[0]!.resolve(500);

    const retry = await screen.findByRole('button', { name: /retry a\.txt/i });
    fireEvent.click(retry);

    await vi.waitFor(() => expect(puts).toHaveLength(2));
    expect(sign).toHaveBeenCalledTimes(2);
    puts[1]!.resolve(200);
    expect(await screen.findByText(/uploaded/i, { selector: 'li *' })).toBeTruthy();
  });
});
