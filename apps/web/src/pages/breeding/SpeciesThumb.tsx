/** Species cue when no animal photo — colour + letter so shed staff can tell buffalo / cow / pig / goat. */

const SPECIES: Record<
  string,
  { letterEn: string; letterNp: string; bg: string; fg: string; labelEn: string; labelNp: string }
> = {
  BUFFALO: { letterEn: 'B', letterNp: 'भै', bg: '#3D433E', fg: '#FFFBF5', labelEn: 'Buffalo', labelNp: 'भैंसी' },
  COW: { letterEn: 'C', letterNp: 'गा', bg: '#00695C', fg: '#FFFBF5', labelEn: 'Cow', labelNp: 'गाई' },
  PIG: { letterEn: 'P', letterNp: 'सु', bg: '#6A1B9A', fg: '#FFFBF5', labelEn: 'Pig', labelNp: 'सुँगुर' },
  GOAT: { letterEn: 'G', letterNp: 'बा', bg: '#E65100', fg: '#FFFBF5', labelEn: 'Goat', labelNp: 'बाख्रा' },
  POULTRY: { letterEn: 'Y', letterNp: 'कु', bg: '#1565C0', fg: '#FFFBF5', labelEn: 'Poultry', labelNp: 'कुखुरा' },
  FISH: { letterEn: 'F', letterNp: 'मा', bg: '#2A6A4A', fg: '#FFFBF5', labelEn: 'Fish', labelNp: 'माछा' },
};

const FALLBACK = {
  letterEn: '?',
  letterNp: '?',
  bg: '#6B6F68',
  fg: '#FFFBF5',
  labelEn: 'Animal',
  labelNp: 'जनावर',
};

export function SpeciesThumb({
  species,
  photoUrl,
  name,
  np = false,
}: {
  species: string;
  photoUrl?: string | null;
  name?: string | null;
  np?: boolean;
}) {
  const mark = SPECIES[species] ?? FALLBACK;
  const label = np ? mark.labelNp : mark.labelEn;
  if (photoUrl) {
    return <img className="watch-photo" src={photoUrl} alt={name ? `${label} · ${name}` : label} />;
  }
  return (
    <span
      className="watch-photo species-thumb"
      style={{ backgroundColor: mark.bg, color: mark.fg }}
      title={label}
      aria-label={label}
    >
      <span className="species-thumb-letter" aria-hidden="true">
        {np ? mark.letterNp : mark.letterEn}
      </span>
      <span className="species-thumb-label">{label}</span>
    </span>
  );
}
