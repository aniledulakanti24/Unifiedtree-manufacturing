import { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { DISPATCH_MODES } from '../data/seed';
import { useLang } from '../i18n';
import Icon from './Icon';
import { todayISO } from '../utils';

/** Vehicle / courier and tracking ID for an order cleared to go – on the work order page and the Dispatch page. */
export default function DispatchForm({ order, onDone }) {
  const { state, act } = useStore();
  const vehicles = state.settings.lists.vehicles;
  const { t } = useLang();
  const [d, setD] = useState({
    mode: 'own',
    carrier: vehicles.own[0] ?? '',
    driverName: '',
    driverPhone: '',
    trackingId: '',
    dispatchDate: todayISO(),
    eta: order.expectedDeliveryDate,
    remarks: '',
  });
  const [error, setError] = useState('');
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));

  const submit = () => {
    if (!d.carrier) return setError('No vehicle or service in this list yet – the administrator adds them on Customize → Lists.');
    if (!d.trackingId.trim()) return setError(t('dispatch.errTracking'));
    if (d.mode === 'own' && (!d.driverName.trim() || !d.driverPhone.trim())) return setError(t('dispatch.errDriver'));
    act('DISPATCH', { id: order.id, dispatch: { ...d, trackingId: d.trackingId.trim() } });
    onDone?.();
  };

  return (
    <>
      <p className="action-help">{t('dispatch.help')}</p>
      <fieldset className="segmented" aria-label="Dispatch mode">
        {Object.keys(DISPATCH_MODES).map((k) => (
          <label key={k} className={d.mode === k ? 'active' : ''}>
            <input
              type="radio"
              name="dispatch-mode"
              value={k}
              checked={d.mode === k}
              onChange={() => setD((x) => ({ ...x, mode: k, carrier: vehicles[k][0] ?? '' }))}
            />
            {t(`dispatch.mode.${k}`)}
          </label>
        ))}
      </fieldset>
      <label>
        {d.mode === 'own' ? t('dispatch.vehicle') : t('dispatch.service')}
        <select value={d.carrier} onChange={(e) => set('carrier', e.target.value)}>
          {vehicles[d.mode].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      {d.mode === 'own' && (
        <div className="form-grid">
          <label>
            {t('dispatch.driverName')} <span className="req">*</span>
            <input value={d.driverName} onChange={(e) => set('driverName', e.target.value)} autoComplete="off" />
          </label>
          <label>
            {t('dispatch.driverPhone')} <span className="req">*</span>
            <input type="tel" value={d.driverPhone} onChange={(e) => set('driverPhone', e.target.value)} autoComplete="off" />
          </label>
        </div>
      )}
      <label>
        {d.mode === 'own' ? t('dispatch.tripId') : t('dispatch.trackingId')} <span className="req">*</span>
        <input value={d.trackingId} onChange={(e) => set('trackingId', e.target.value)} autoComplete="off" />
      </label>
      <div className="form-grid">
        <label>
          {t('dispatch.date')}
          <input type="date" value={d.dispatchDate} onChange={(e) => set('dispatchDate', e.target.value)} />
        </label>
        <label>
          {t('dispatch.eta')}
          <input type="date" value={d.eta} onChange={(e) => set('eta', e.target.value)} />
        </label>
      </div>
      <label>
        {t('dispatch.remarks')}
        <input value={d.remarks} onChange={(e) => set('remarks', e.target.value)} />
      </label>
      <FieldError>{error}</FieldError>
      <button className="btn primary block lg" onClick={submit}>
        <Icon name="truck" size={16} /> {t('dispatch.confirm')}
      </button>
    </>
  );
}

function FieldError({ children }) {
  if (!children) return null;
  return (
    <p className="field-error" role="alert">
      <Icon name="alert" size={14} /> {children}
    </p>
  );
}
