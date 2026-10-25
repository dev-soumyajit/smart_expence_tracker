export async function clearProfileExports(_userId: string): Promise<void> {}
export async function exportProfileData(_userId: string): Promise<void> {
  throw new Error('Use the signed-in web app to download your financial data in a browser.');
}
