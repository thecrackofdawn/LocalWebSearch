import { BrowserManager } from '../browser/browser.js';
import { writeFileSync } from 'fs';

export async function exportCookies(
  browserManager: BrowserManager,
  outputPath: string
): Promise<void> {
  const browser = await browserManager.getBrowser();
  const context = browser.contexts()[0];

  const cookies = await context.cookies();

  const exportData = {
    exportedAt: new Date().toISOString(),
    cookies: cookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expiry: cookie.expires,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite
    }))
  };

  writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
  console.log(`Exported ${cookies.length} cookies to ${outputPath}`);
}
