import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { api } from './api';

function exportDirectory(userId: string) {
  if (!/^[a-f0-9-]{36}$/i.test(userId)) throw new Error('Reload your profile before exporting.');
  return new Directory(Paths.cache, 'morrowmint-exports-' + userId);
}
export async function clearProfileExports(userId: string): Promise<void> {
  const directory = exportDirectory(userId);
  if (directory.exists) directory.delete();
}
export async function exportProfileData(userId: string): Promise<void> {
  let Sharing: typeof import('expo-sharing');
  try { Sharing = await import('expo-sharing'); }
  catch { throw new Error('Rebuild the mobile app to enable file export, or export from the web app.'); }
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device. You can export your data from the web app.');
  const data = await api<Record<string, unknown>>('settings/export');
  const directory = exportDirectory(userId);
  directory.create({ idempotent: true });
  // Keep recent files available: Android's chooser can finish before the receiving app reads them.
  for (const entry of directory.list()) {
    if (entry instanceof File && /^morrowmint-data-[a-f0-9-]+\.json$/.test(entry.name) && entry.modificationTime && entry.modificationTime < Date.now() - 86400000) entry.delete();
  }
  const file = new File(directory, 'morrowmint-data-' + Crypto.randomUUID() + '.json');
  try {
    file.write(JSON.stringify(data, null, 2) + '\n');
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save your Morrowmint data' });
  } catch (problem) {
    if (file.exists) file.delete();
    throw problem;
  }
}
