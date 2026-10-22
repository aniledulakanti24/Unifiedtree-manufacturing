import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { can, ROLES } from '../auth/permissions';
import { NEXT_STAGE, canApprove, nextStep, openApproval } from '../data/statuses';
import { DISPATCH_MODES, QC_CHECKS, VEHICLE_OPTIONS } from '../data/seed';
import { ApprovalBadge, Card, DueChip, DueDate, PriorityBadge, StageTracker, StatusBadge, WorkDetails } from '../components/ui';
import StageApproval from '../components/StageApproval';
import { AccessDenied } from '../components/RequirePermission';
import MaterialCheck from '../components/MaterialCheck';
import OrderChat from '../components/OrderChat';
import ProblemBox from '../components/ProblemBox';
import { ReasonDialog, ReasonText, reasonRecord } from '../components/ReasonPicker';
import Icon from '../components/Icon';
import { useLang } from '../i18n';
import { checkAvailability, fmtDate, fmtDateTime, todayISO } from '../utils';

export default function OrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { state } = useStore();
  const { t } = useLang();
  const order = state.orders.find((o) => o.id === id);

  if (!order)
    return (
      <div className="empty-state">
        <span className="empty-state-icon">
          <Icon name="file" size={28} />
        </span>
        <h1>Order {id} not found</h1>
        <Link className="btn primary" to="/orders">
          Back to orders
        </Link>
      </div>
    );
  if (!can(user.role, 'orders.viewAll') && order.createdBy !== user.id)
    return <AccessDenied role={user.role} message="You can only view work orders you created." />;

  const step = nextStep(order);
  const mine = step && (step.approval && openApproval(order).state === 'pending' ? canApprove(user, order) : step.roles.includes(user.role) || user.role === 'admin');
  const done = ['DISPATCHED', 'DELIVERED'].includes(order.status);

  return (
    <>
      <Link to="/orders" className="back-link">
        <Icon name="arrowLeft" size={16} /> {t('nav.orders')}
      </Link>
      <div className="page-header">
        <div>
          <h1>
            {order.id} <StatusBadge status={order.status} /> <ApprovalBadge order={order} />
          </h1>
          <p className="muted">
            {order.customer.name} · Customer PO {order.customerPoNo} · PI {order.piNo || '—'} · entered by{' '}
            <strong>{order.createdByName}</strong> on {fmtDate(order.createdAt)}
          </p>
        </div>
        {!done && (
          <div className="page-actions">
            <DueChip date={order.expectedDeliveryDate} big />
          </div>
        )}
      </div>

      <Card className="tracker-card">
        <StageTracker status={order.status} history={order.history} approval={order.approval} />
        {step ? (
          <div className={`next-step ${mine ? 'mine' : ''}`}>
            <Icon name={mine ? 'arrowRight' : 'clock'} size={18} />
            <span>
              <strong>Next step:</strong> {step.text}{' '}
              <span className="muted">· {mine ? 'your action' : `waiting on ${step.roles.map((r) => ROLES[r].label).join(' / ')}`}</span>
            </span>
          </div>
        ) : (
          <div className="next-step done">
            <Icon name="checkCircle" size={18} /> <strong>Order complete.</strong> Delivered to the customer.
          </div>
        )}
      </Card>

      {order.status === 'ON_HOLD' && (
        <div className="alert red" role="alert">
          <Icon name="pause" size={18} />
          <div>
            <strong>{t('status.ON_HOLD')}:</strong> <ReasonText code={order.holdCode} note={order.holdNote} fallback={order.holdReason} />
          </div>
        </div>
      )}

      <div className="detail-grid">
        <div className="detail-action stack">
          <ActionPanel key={`${order.id}-${order.status}`} order={order} />
          <ProblemBox order={order} />
          <OrderChat order={order} />
        </div>

        <div className="detail-main stack">
          <WorkDetails order={order} products={state.products} />

          <Card title="Customer & delivery" icon="user">
            <dl className="dl">
              <dt>Customer</dt>
              <dd>{order.customer.name}</dd>
              <dt>Customer PO no.</dt>
              <dd>
                <strong>{order.customerPoNo}</strong> {order.poDate && <span className="muted small">· {fmtDate(order.poDate)}</span>}
              </dd>
              <dt>PI no.</dt>
              <dd>
                <strong>{order.piNo || '—'}</strong> {order.piDate && <span className="muted small">· {fmtDate(order.piDate)}</span>}
              </dd>
              <dt>Entered by</dt>
              <dd>
                {order.createdByName} <span className="muted small">· {fmtDateTime(order.createdAt)}</span>
              </dd>
              <dt>Contact</dt>
              <dd>{order.customer.contact || '—'}</dd>
              <dt>Phone</dt>
              <dd>{order.customer.phone ? <a href={`tel:${order.customer.phone}`}>{order.customer.phone}</a> : '—'}</dd>
              <dt>Email</dt>
              <dd>{order.customer.email ? <a href={`mailto:${order.customer.email}`}>{order.customer.email}</a> : '—'}</dd>
              <dt>Delivery address</dt>
              <dd>{order.customer.address || '—'}</dd>
              <dt>Expected delivery</dt>
              <dd>
                <DueDate date={order.expectedDeliveryDate} done={done} />
              </dd>
              <dt>Priority</dt>
              <dd>
                <PriorityBadge priority={order.priority} />
              </dd>
            </dl>
          </Card>

          {can(user.role, 'inventory.view') && (
            <Card title="Raw material availability" icon="factory">
              <MaterialCheck order={order} />
            </Card>
          )}

          {order.qc && <QcReport qc={order.qc} />}

          {order.dispatch && <DispatchInfo d={order.dispatch} />}
        </div>

        <div className="detail-log">
          <Card title="Activity log" icon="clock">
            <ol className="timeline">
              {[...order.history].reverse().map((h, i) => (
                <li key={i} className={h.approval ? `tl-approval ${h.approval}` : ''}>
                  <StatusBadge status={h.status} />
                  <div className="small">
                    <strong>{h.by}</strong> <span className="muted">· {ROLES[h.role]?.label ?? h.role} · {fmtDateTime(h.at)}</span>
                  </div>
                  {h.note && <div className="small">{h.note}</div>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}

function QcReport({ qc }) {
  const { t } = useLang();
  const pass = qc.result === 'PASS';
  return (
    <Card title="QC inspection report" icon="shield" className={pass ? 'border-green' : 'border-red'}>
      <p className="qc-summary">
        <span className={`badge tone-${pass ? 'green' : 'red'}`}>{pass ? 'PASSED' : 'FAILED'}</span>
        <span className="muted small">
          by {qc.by} · {fmtDateTime(qc.at)} · {qc.inspectedQty} units inspected
        </span>
      </p>
      <ul className="checklist">
        {QC_CHECKS.map((c, i) => (
          <li key={c} className={qc.checks[i] ? 'ok-text' : 'bad-text'}>
            <Icon name={qc.checks[i] ? 'checkCircle' : 'xCircle'} size={16} /> {t(`qc.check.${i}`)}
          </li>
        ))}
      </ul>
      <p className="small">
        <strong>Remarks:</strong> {qc.code ? <ReasonText code={qc.code} note={qc.note} /> : qc.remarks}
      </p>
    </Card>
  );
}

function DispatchInfo({ d }) {
  return (
    <Card title="Dispatch details" icon="truck">
      <dl className="dl">
        <dt>Mode</dt>
        <dd>{DISPATCH_MODES[d.mode]}</dd>
        <dt>{d.mode === 'own' ? 'Vehicle' : 'Carrier'}</dt>
        <dd>{d.carrier}</dd>
        {d.mode === 'own' && (
          <>
            <dt>Driver</dt>
            <dd>
              {d.driverName} · {d.driverPhone}
            </dd>
          </>
        )}
        <dt>Tracking ID</dt>
        <dd>
          <code className="tracking">{d.trackingId}</code>
        </dd>
        <dt>Dispatched on</dt>
        <dd>{fmtDate(d.dispatchDate)}</dd>
        <dt>Expected arrival</dt>
        <dd>{fmtDate(d.eta)}</dd>
        {d.remarks && (
          <>
            <dt>Remarks</dt>
            <dd>{d.remarks}</dd>
          </>
        )}
      </dl>
    </Card>
  );
}

/** Shows only the action the current role is allowed to take at the order's current stage. */
function ActionPanel({ order }) {
  const { user } = useAuth();
  const { t } = useLang();
  const role = user.role;
  const s = order.status;

  let body = null;
  if (openApproval(order)) body = <StageApproval order={order} />;
  else if (['PENDING_REVIEW', 'ON_HOLD'].includes(s) && can(role, 'orders.review')) body = <ReviewAction order={order} />;
  else if (NEXT_STAGE[s] && can(role, 'production.update')) body = <StageAction order={order} />;
  else if (s === 'READY_TO_DISPATCH' && can(role, 'qc.inspect')) body = <QcAction order={order} />;
  else if (s === 'QC_APPROVED' && can(role, 'client.approve')) body = <ClientAction order={order} />;
  else if (s === 'CLIENT_APPROVED' && can(role, 'dispatch.manage')) body = <DispatchAction order={order} />;
  else if (s === 'DISPATCHED' && can(role, 'delivery.confirm')) body = <DeliverAction order={order} />;

  return (
    <Card
      title={openApproval(order) ? t('approval.title') : body ? t('action.your') : t('action.status')}
      icon={openApproval(order) ? 'lock' : body ? 'arrowRight' : 'info'}
      className={body ? 'action-card' : ''}
    >
      {body ?? <p className="muted">{s === 'DELIVERED' ? t('action.complete') : t('action.none', { s: t(`status.${s}`) })}</p>}
    </Card>
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

function ReviewAction({ order }) {
  const { state, act } = useStore();
  const { t } = useLang();
  const [note, setNote] = useState('');
  const [holding, setHolding] = useState(false);
  const { ok } = checkAvailability(order.items, state.products, state.materials);

  return (
    <>
      <p className="action-help">{t('review.help')}</p>
      <div className={`material-status ${ok ? 'ok' : 'bad'}`}>
        <Icon name={ok ? 'checkCircle' : 'alert'} size={18} />
        {ok ? t('review.ok') : t('review.short')}
      </div>
      {ok && (
        <label>
          {t('review.remarks')}
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      )}
      <div className="btn-row">
        <button className="btn success lg" disabled={!ok} onClick={() => act('REVIEW_ORDER', { id: order.id, decision: 'accept', note: note.trim() })}>
          <Icon name="check" size={16} /> {t('review.accept')}
        </button>
        <button className="btn danger lg" onClick={() => setHolding(true)}>
          <Icon name="pause" size={16} /> {order.status === 'ON_HOLD' ? t('review.updateHold') : t('review.hold')}
        </button>
      </div>
      {!ok && (
        <Link to="/inventory" className="small inline-icon">
          <Icon name="box" size={14} /> {t('review.restock')}
        </Link>
      )}
      {holding && (
        <ReasonDialog
          group="hold"
          title={t('reason.holdTitle')}
          onClose={() => setHolding(false)}
          onSubmit={({ code, note: extra }) => {
            act('REVIEW_ORDER', { id: order.id, decision: 'hold', note: reasonRecord(code, extra), code, extra });
            setHolding(false);
          }}
        />
      )}
    </>
  );
}

function StageAction({ order }) {
  const { act } = useStore();
  const { t } = useLang();
  const [note, setNote] = useState('');
  const to = NEXT_STAGE[order.status];
  return (
    <>
      <p className="action-help">
        {t('stage.current')} <strong>{t(`status.${order.status}`)}</strong>
      </p>
      <label>
        {t('stage.note')}
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Batch no., shift…" />
      </label>
      <button className="btn primary block lg" onClick={() => act('ADVANCE_STAGE', { id: order.id, to, note: note.trim() })}>
        {t('prod.move', { stage: t(`flow.${to}`) })} <Icon name="arrowRight" size={16} />
      </button>
      {to === 'READY_TO_DISPATCH' && <p className="muted small">{t('stage.notify')}</p>}
    </>
  );
}

function QcAction({ order }) {
  const { act } = useStore();
  const { t } = useLang();
  const totalQty = order.items.reduce((s, it) => s + it.qty, 0);
  const [checks, setChecks] = useState(QC_CHECKS.map(() => false));
  const [inspectedQty, setInspectedQty] = useState(totalQty);
  const [remarks, setRemarks] = useState('');
  const [failing, setFailing] = useState(false);
  const [error, setError] = useState('');
  const done = checks.filter(Boolean).length;

  const pass = () => {
    if (done < checks.length) return setError(t('qc.errAll'));
    act('QC_SUBMIT', { id: order.id, result: 'PASS', checks, inspectedQty: Number(inspectedQty), remarks: remarks.trim() || 'All checks OK' });
  };

  return (
    <>
      <p className="action-help">{t('qc.help')}</p>
      <fieldset className="checks">
        <legend>
          {t('qc.checklist')}{' '}
          <span className="muted">
            ({done}/{checks.length})
          </span>
        </legend>
        {QC_CHECKS.map((c, i) => (
          <label key={c} className={`check ${checks[i] ? 'checked' : ''}`}>
            <input
              type="checkbox"
              checked={checks[i]}
              onChange={(e) => {
                const checked = e.target.checked;
                setChecks((prev) => prev.map((v, j) => (j === i ? checked : v)));
                setError('');
              }}
            />
            {t(`qc.check.${i}`)}
          </label>
        ))}
        <button type="button" className="link-btn small" onClick={() => setChecks(QC_CHECKS.map(() => true))}>
          {t('qc.tickAll')}
        </button>
      </fieldset>
      <label>
        {t('qc.units')}
        <input type="number" min="1" value={inspectedQty} onChange={(e) => setInspectedQty(e.target.value)} />
      </label>
      <label>
        {t('qc.remarks')}
        <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </label>
      <FieldError>{error}</FieldError>
      <div className="btn-row">
        <button className="btn success lg" onClick={pass}>
          {t('qc.pass')}
        </button>
        <button className="btn danger lg" onClick={() => setFailing(true)}>
          {t('qc.fail')}
        </button>
      </div>
      {failing && (
        <ReasonDialog
          group="qcFail"
          title={t('reason.qcTitle')}
          onClose={() => setFailing(false)}
          onSubmit={({ code, note }) => {
            const all = [note, remarks.trim()].filter(Boolean).join(' – ');
            act('QC_SUBMIT', {
              id: order.id,
              result: 'FAIL',
              checks,
              inspectedQty: Number(inspectedQty),
              remarks: reasonRecord(code, all),
              code,
              note: all,
            });
            setFailing(false);
          }}
        />
      )}
    </>
  );
}

function ClientAction({ order }) {
  const { act } = useStore();
  const { t } = useLang();
  const [note, setNote] = useState('');
  const [concern, setConcern] = useState(false);
  const c = order.customer;

  const mailto = `mailto:${c.email}?subject=${encodeURIComponent(`QC report for your PO ${order.customerPoNo}`)}&body=${encodeURIComponent(
    `Dear ${c.contact || c.name},\n\nYour order ${order.customerPoNo} (our ref ${order.id}) has passed quality inspection.\nQC remarks: ${order.qc.remarks}\n\nPlease confirm so we can dispatch.\n\nRegards`,
  )}`;

  return (
    <>
      <ol className="mini-steps">
        <li>Share the QC report with the client.</li>
        <li>Record their response below.</li>
      </ol>
      {c.email && (
        <a className="btn block" href={mailto}>
          <Icon name="mail" size={16} /> Email QC report to client
        </a>
      )}
      <label>
        Client response
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Approved by Dr. Arvind over email" />
      </label>
      <div className="btn-row">
        <button className="btn success lg" onClick={() => act('CLIENT_DECISION', { id: order.id, approved: true, note: note.trim() || 'Client approved QC report' })}>
          <Icon name="check" size={16} /> Client approved
        </button>
        <button className="btn danger lg" onClick={() => setConcern(true)}>
          {t('client.concern')}
        </button>
      </div>
      {concern && (
        <ReasonDialog
          group="concern"
          title={t('reason.concernTitle')}
          onClose={() => setConcern(false)}
          onSubmit={({ code, note: extra }) => {
            act('CLIENT_DECISION', { id: order.id, approved: false, note: reasonRecord(code, [extra, note.trim()].filter(Boolean).join(' – ')) });
            setConcern(false);
          }}
        />
      )}
    </>
  );
}

function DispatchAction({ order }) {
  const { act } = useStore();
  const { t } = useLang();
  const [d, setD] = useState({
    mode: 'own',
    carrier: VEHICLE_OPTIONS.own[0],
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
    if (!d.trackingId.trim()) return setError(t('dispatch.errTracking'));
    if (d.mode === 'own' && (!d.driverName.trim() || !d.driverPhone.trim())) return setError(t('dispatch.errDriver'));
    act('DISPATCH', { id: order.id, dispatch: { ...d, trackingId: d.trackingId.trim() } });
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
              onChange={() => setD((x) => ({ ...x, mode: k, carrier: VEHICLE_OPTIONS[k][0] }))}
            />
            {t(`dispatch.mode.${k}`)}
          </label>
        ))}
      </fieldset>
      <label>
        {d.mode === 'own' ? t('dispatch.vehicle') : t('dispatch.service')}
        <select value={d.carrier} onChange={(e) => set('carrier', e.target.value)}>
          {VEHICLE_OPTIONS[d.mode].map((v) => (
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

function DeliverAction({ order }) {
  const { act } = useStore();
  const { t } = useLang();
  const [note, setNote] = useState('');
  return (
    <>
      <p className="action-help">
        {t('deliver.inTransit')} <code className="tracking">{order.dispatch.trackingId}</code>
      </p>
      <label>
        {t('deliver.note')}
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Received by, POD no.…" />
      </label>
      <button className="btn success block lg" onClick={() => act('DELIVER', { id: order.id, note: note.trim() })}>
        <Icon name="checkCircle" size={16} /> {t('deliver.btn')}
      </button>
    </>
  );
}
