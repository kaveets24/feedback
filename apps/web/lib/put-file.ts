/**
 * PUTs a file straight to storage with a presigned URL, reporting progress (fetch can't report
 * upload progress, so this uses XMLHttpRequest). `headers` must be exactly the ones the URL was
 * signed with. Aborting `signal` stops the transfer and rejects.
 */
export function putFile(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.onabort = () => reject(new DOMException('The upload was cancelled', 'AbortError'));
    xhr.open('PUT', url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage refused the upload (HTTP ${xhr.status})`));
    xhr.onerror = () => reject(new Error('The upload was interrupted'));
    xhr.send(file);
  });
}
