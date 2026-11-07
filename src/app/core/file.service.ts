import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

@Injectable({ providedIn: 'root' })
export class FileService {
  /** Saves text as a file: share sheet on device, browser download on web. */
  async saveText(filename: string, content: string, mime: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      const res = await Filesystem.writeFile({
        path: filename,
        data: content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({ title: filename, url: res.uri, dialogTitle: 'Save or share' });
      return;
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /** Saves binary data (e.g. an .xlsx): share sheet on device, browser download on web. */
  async saveBinary(filename: string, bytes: Uint8Array, mime: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const res = await Filesystem.writeFile({ path: filename, data: btoa(bin), directory: Directory.Cache });
      await Share.share({ title: filename, url: res.uri, dialogTitle: 'Save or share' });
      return;
    }
    const blob = new Blob([bytes as BlobPart], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  readBuffer(file: File): Promise<ArrayBuffer> {
    return file.arrayBuffer();
  }

  readText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result ?? ''));
      fr.onerror = () => reject(fr.error);
      fr.readAsText(file);
    });
  }
}
