import { FormEvent, useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { normalizeNepalMobile, type AuthUser } from '@farm/contracts';
import { useAuth } from '../auth/auth-context';
import { api } from '../api/client';

/** Lets each person set the Nepal mobile that urgent SMS reminders go to. */
export function SmsPhoneCard() {
  const { t } = useTranslation();
  const { user, patchUser } = useAuth();
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPhone(user?.phone ?? '');
  }, [user?.phone]);

  const save = useMutation({
    mutationFn: (value: string | null) =>
      api<AuthUser>('/v1/auth/me', { method: 'PATCH', body: JSON.stringify({ phone: value }) }),
    onSuccess: (me) => {
      patchUser({ phone: me.phone ?? null });
      setSaved(true);
    },
    onError: (err: Error) => setError(err.message),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    const trimmed = phone.trim();
    if (trimmed && !normalizeNepalMobile(trimmed)) {
      setError(t('sms.invalid'));
      return;
    }
    setError(null);
    save.mutate(trimmed ? normalizeNepalMobile(trimmed) : null);
  };

  return (
    <form className="card form-card" style={{ marginBottom: 16 }} onSubmit={onSubmit}>
      <h2>{t('sms.title')}</h2>
      <p className="muted">{t('sms.hint')}</p>
      <div className="field">
        <label htmlFor="sms-phone">{t('sms.label')}</label>
        <input
          id="sms-phone"
          type="tel"
          inputMode="tel"
          placeholder="98XXXXXXXX"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setSaved(false);
          }}
        />
      </div>
      {error && <p className="error-text">{error}</p>}
      {saved && !error && <p className="muted">{t('sms.saved')}</p>}
      <button className="btn" type="submit" disabled={save.isPending}>
        {t('common.save')}
      </button>
    </form>
  );
}
