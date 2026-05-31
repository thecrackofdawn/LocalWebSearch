import { BrowserManager } from '../browser/browser.js';
import { readFileSync } from 'fs';

interface CookieImport {
  name: string;
  value: string;
  domain: string;
  path: string;
  expiry?: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
}

export async function importCookies(
  browserManager: BrowserManager,
  inputPath: string
): Promise<void> {
  const importData = JSON.parse(readFileSync(inputPath, 'utf-8'));

  const browser = await browserManager.getBrowser();
  const context = browser.contexts()[0];

  const cookies = importData.cookies.map((c: CookieImport) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    expires: c.expiry,
    secure: c.secure,
    httpOnly: c.httpOnly,
    sameSite: c.sameSite as any
  }));

  await context.addCookies(cookies);
  console.log(`Imported ${cookies.length} cookies from ${inputPath}`);
}
