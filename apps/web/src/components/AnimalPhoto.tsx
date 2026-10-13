import { useEffect, useState } from 'react';
import { getAccessToken } from '../api/client';

const SPECIES_PICTURE: Record<string, string> = {
  BUFFALO: '🐃',
  COW: '🐄',
  GOAT: '🐐',
  PIG: '🐖',
  SHEEP: '🐑',
  POULTRY: '🐔',
  CHICKEN: '🐔',
  LAYER: '🐔',
  BROILER: '🐓',
  DUCK: '🦆',
  FISH: '🐟',
  RABBIT: '🐇',
};

/** Picture key for a batch: poultry and fish categories are free text, so fall back to the batch kind. */
export function batchPictureKind(kind?: string | null, category?: string | null): string {
  const cat = (category ?? '').toUpperCase();
  if (cat && SPECIES_PICTURE[cat]) return cat;
  if (kind === 'FISH') return 'FISH';
  if (kind === 'POULTRY') return cat.includes('DUCK') ? 'DUCK' : 'POULTRY';
  return cat;
}

const loaded = new Map<string, Promise<string | null>>();

/** The photo endpoint needs the bearer token, so a plain <img src> would 401. */
function loadPhoto(url: string): Promise<string | null> {
  let pending = loaded.get(url);
  if (!pending) {
    const token = getAccessToken();
    pending = fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {} })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch(() => null)
      .then((src) => {
        if (!src) loaded.delete(url);
        return src;
      });
    loaded.set(url, pending);
  }
  return pending;
}

function needsAuth(url: string): boolean {
  return url.startsWith('/');
}

/** Animal photo for quick recognition; without one, a species picture still gives a visual cue. */
export function AnimalPhoto({
  photoUrl,
  species,
  size = 52,
  className,
}: {
  photoUrl?: string | null;
  species?: string | null;
  size?: number;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(() =>
    photoUrl && !needsAuth(photoUrl) ? photoUrl : null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (!photoUrl) {
      setSrc(null);
      return;
    }
    if (!needsAuth(photoUrl)) {
      setSrc(photoUrl);
      return;
    }
    let cancelled = false;
    setSrc(null);
    void loadPhoto(photoUrl).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [photoUrl]);

  const box = { width: size, height: size, borderRadius: Math.round(size / 5) };
  const classes = ['animal-photo', className].filter(Boolean).join(' ');

  if (src && !failed) {
    return <img src={src} alt="" className={classes} style={box} onError={() => setFailed(true)} />;
  }
  const kind = (species ?? '').toUpperCase();
  return (
    <span
      className={`${classes} animal-photo-empty`}
      style={{ ...box, fontSize: Math.round(size * 0.55) }}
      aria-hidden="true"
    >
      {SPECIES_PICTURE[kind] ?? '🐾'}
    </span>
  );
}
