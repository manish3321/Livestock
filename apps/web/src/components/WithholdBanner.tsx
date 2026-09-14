import { formatDate } from '@farm/contracts';

/** Red Nepali banner. Rendered above every other animal surface. */
export function WithholdBanner({
  messageNp,
  endDate,
}: {
  messageNp: string;
  endDate: string;
}) {
  return (
    <div className="hold-banner hold-banner-red" role="alert">
      {messageNp} — {formatDate(endDate)}
    </div>
  );
}
