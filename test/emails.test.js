import { describe, it, expect } from 'vitest';
import { extractEmails } from '../lib/emails';

describe('extractEmails', () => {
  it('ranks mailto + own-domain first and filters junk addresses', () => {
    const html = `
      <a href="mailto:info@cafe-imaginario.com">Escríbenos</a>
      <p>soporte@gestoria-externa.es</p>
      <img src="icon@2x.png">
      <p>noreply@newsletter.io</p>
      <p>a3f9c2d4e5b6a7f8@tracking.io</p>`;
    const out = extractEmails(html, 'https://www.cafe-imaginario.com');
    expect(out[0]).toBe('info@cafe-imaginario.com'); // mailto weight + domain affinity
    expect(out).toContain('soporte@gestoria-externa.es');
    expect(out.join()).not.toMatch(/icon@2x|noreply|tracking\.io/);
  });
});
