import { describe, expect, it } from 'vitest';
import { animalScanUrl, parseQrPayload, qrSvg } from '../src/lib/qr';

describe('qr', () => {
  it('builds an SVG without needing a canvas', async () => {
    const svg = await qrSvg(animalScanUrl('29afae65-13a6-4add-96ab-8301668dd1ad'));
    expect(svg).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
    expect(svg).toContain('path');
  });

  it('parses the printed animal URL', () => {
    const url = animalScanUrl('29afae65-13a6-4add-96ab-8301668dd1ad');
    expect(parseQrPayload(url)).toEqual({
      kind: 'animal',
      id: '29afae65-13a6-4add-96ab-8301668dd1ad',
    });
  });
});
