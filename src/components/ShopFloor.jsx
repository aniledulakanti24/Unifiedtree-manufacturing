import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { can } from '../auth/permissions';
import { PROCESSES, activeProcesses } from '../data/processes';
import { REASONS, reasonIcon } from '../data/reasons';
import { isOpen } from '../data/statuses';
import { ReasonText } from './ReasonPicker';
import { Card, Modal } from './ui';
import Icon from './Icon';
import { useLang } from '../i18n';
import { addDays, fmtDate, fmtDateTime, orderUnits, todayISO } from '../utils';

const hoursBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 3600000;
const fmtHours = (h) => (h < 1 ? `${Math.round(h * 60)} min` : `${Math.round(h * 10) / 10} h`);

/** Planned machine hours per process for the whole order (from each product's route). */
function plannedHours(order, products) {
  const hours = {};
  order.items.forEach((it) =>
    Object.entries(products.find((p) => p.id === it.productId)?.route ?? {}).forEach(([proc, h]) => (hours[proc] = (hours[proc] ?? 0) + h * it.qty)),
  );
  return hours;
}

/**
 * Shop-floor record for an order: labour time per process (start / stop), work sent to outside job workers,
 * and pieces scrapped or rejected. Everyone can see it; factory staff can add to it while the order is open.
 */
export default function ShopFloor({ order }) {
  const { user } = useAuth();
  const { state } = useStore();
  const [dialog, setDialog] = useState(null);
  const planned = plannedHours(order, state.products);
  const factory = can(user.role, 'production.update');
  const open = isOpen(order);
  const logs = order.timeLogs ?? [];
  const jobs = order.jobWork ?? [];
  const scrap = order.scrap ?? [];
  const scrapQty = scrap.reduce((s, x) => s + x.qty, 0);

  return (
    <Card title="Shop floor – time, job work & scrap" icon="factory">
      <Labour order={order} planned={planned} logs={logs} canWork={open} />

      <section className="sf-section">
        <div className="row-between">
          <h3>Job work {jobs.length > 0 && <span className="count-pill">{jobs.length}</span>}</h3>
          {factory && open && (
            <button className="btn small" onClick={() => setDialog('send')}>
              <Icon name="truck" size={14} /> Send for job work
            </button>
          )}
        </div>
        {jobs.length === 0 ? (
          <p className="muted small">Nothing sent to an outside workshop. Use this when a process (e.g. powder coating) is done by a job worker.</p>
        ) : (
          <ul className="feed">
            {jobs.map((j) => {
              const w = state.jobWorkers.find((x) => x.id === j.workerId);
              return (
                <li key={j.id}>
                  <span className="feed-main row-between">
                    <span>
                      <strong>{PROCESSES[j.process]?.label}</strong> at {w?.name} · {j.qty} pcs · challan <code className="tracking">{j.challanNo}</code>
                    </span>
                    {j.status === 'OUT' ? (
                      factory ? (
                        <button className="btn small success" onClick={() => setDialog({ type: 'return', job: j })}>
                          Received back
                        </button>
                      ) : (
                        <span className="badge tone-amber">With job worker</span>
                      )
                    ) : (
                      <span className="badge tone-green">Back</span>
                    )}
                  </span>
                  <span className="feed-sub">
                    Sent {fmtDateTime(j.sentAt)} by {j.sentBy} · due back {fmtDate(j.expectedBack)}
                    {j.status === 'DONE' && ` · returned ${fmtDateTime(j.returnedAt)}: ${j.okQty} OK${j.rejectedQty ? `, ${j.rejectedQty} rejected` : ''}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="sf-section">
        <div className="row-between">
          <h3>
            Scrap & rejections {scrapQty > 0 && <span className="badge tone-red">{scrapQty} pcs</span>}
          </h3>
          {factory && open && (
            <button className="btn small danger" onClick={() => setDialog('scrap')}>
              Report scrap
            </button>
          )}
        </div>
        {scrap.length === 0 ? (
          <p className="muted small">No pieces scrapped or rejected.</p>
        ) : (
          <ul className="feed">
            {scrap.map((s, i) => (
              <li key={i}>
                <span className="feed-main">
                  <strong>{s.qty} pcs</strong> · <ReasonText code={s.code} note={s.note} />
                </span>
                <span className="feed-sub">
                  {{ qc: 'At QC', jobwork: 'After job work' }[s.stage] ?? 'In production'} · {s.by}, {fmtDateTime(s.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {dialog === 'send' && <SendJobWork order={order} onClose={() => setDialog(null)} />}
      {dialog?.type === 'return' && <ReturnJobWork order={order} job={dialog.job} onClose={() => setDialog(null)} />}
      {dialog === 'scrap' && <ScrapDialog order={order} onClose={() => setDialog(null)} />}
    </Card>
  );
}

/** Start / stop work on a process; actual hours per process next to the planned hours. */
function Labour({ order, planned, logs, canWork }) {
  const { user } = useAuth();
  const { act } = useStore();
  const [, tick] = useState(0);
  const procs = Object.keys(planned);
  const [proc, setProc] = useState(procs[0] ?? 'assembly');
  const mine = logs.find((t) => !t.end && t.byId === user.id);
  const running = logs.filter((t) => !t.end);

  // Running timers update every minute.
  useEffect(() => {
    if (!running.length) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, [running.length]);

  const now = new Date().toISOString();
  const actual = {};
  logs.forEach((t) => (actual[t.process] = (actual[t.process] ?? 0) + hoursBetween(t.start, t.end ?? now)));

  return (
    <section className="sf-section">
      <div className="row-between">
        <h3>Labour time</h3>
        {canWork &&
          (mine ? (
            <button className="btn small danger" onClick={() => act('STOP_WORK', { id: order.id, logId: mine.id })}>
              <Icon name="pause" size={14} /> Stop {PROCESSES[mine.process]?.label} ({fmtHours(hoursBetween(mine.start, now))})
            </button>
          ) : (
            <span className="row-gap">
              <select className="inline-select" value={proc} onChange={(e) => setProc(e.target.value)} aria-label="Process">
                {(procs.length ? procs : activeProcesses().map(([k]) => k)).map((k) => (
                  <option key={k} value={k}>
                    {PROCESSES[k].label}
                  </option>
                ))}
              </select>
              <button className="btn small success" onClick={() => act('START_WORK', { id: order.id, process: proc })}>
                ▶ Start work
              </button>
            </span>
          ))}
      </div>
      <div className="table-wrap">
        <table className="table compact">
          <thead>
            <tr>
              <th>Process</th>
              <th className="num">Planned</th>
              <th className="num">Actual</th>
              <th>Who is on it</th>
            </tr>
          </thead>
          <tbody>
            {[...new Set([...procs, ...Object.keys(actual)])].map((k) => {
              const a = actual[k] ?? 0;
              const p = planned[k] ?? 0;
              return (
                <tr key={k}>
                  <td>{PROCESSES[k]?.label}</td>
                  <td className="num">{p ? fmtHours(p) : '—'}</td>
                  <td className={`num ${p && a > p * 1.1 ? 'bad-text' : ''}`}>{a ? fmtHours(a) : '—'}</td>
                  <td className="small">
                    {running
                      .filter((t) => t.process === k)
                      .map((t) => `${t.by} (since ${fmtDateTime(t.start).split(', ')[1] ?? ''})`)
                      .join(', ') || <span className="muted">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SendJobWork({ order, onClose }) {
  const { state, act } = useStore();
  const procs = Object.keys(plannedHours(order, state.products)).filter((k) => state.jobWorkers.some((w) => w.process === k));
  const [process, setProcess] = useState(procs[0] ?? '');
  const workers = state.jobWorkers.filter((w) => w.process === process);
  const [workerId, setWorkerId] = useState(workers[0]?.id ?? '');
  const worker = state.jobWorkers.find((w) => w.id === workerId);
  const [qty, setQty] = useState(String(orderUnits(order)));
  const [expectedBack, setExpectedBack] = useState(addDays(todayISO(), worker?.leadDays ?? 3));
  const [challanNo, setChallanNo] = useState('');

  const pickProcess = (k) => {
    setProcess(k);
    const w = state.jobWorkers.find((x) => x.process === k);
    setWorkerId(w?.id ?? '');
    setExpectedBack(addDays(todayISO(), w?.leadDays ?? 3));
  };

  if (!procs.length)
    return (
      <Modal title="Send for job work" onClose={onClose}>
        <p>No job worker is set up for the processes this order needs. Add one in Setup → Job workers.</p>
      </Modal>
    );

  return (
    <Modal title={`Send ${order.id} for job work`} onClose={onClose}>
      <div className="form-grid">
        <label>
          Process
          <select value={process} onChange={(e) => pickProcess(e.target.value)}>
            {procs.map((k) => (
              <option key={k} value={k}>
                {PROCESSES[k].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Job worker
          <select value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pieces sent
          <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <label>
          Expected back
          <input type="date" min={todayISO()} value={expectedBack} onChange={(e) => setExpectedBack(e.target.value)} />
        </label>
      </div>
      <label>
        Job work challan no.
        <input value={challanNo} onChange={(e) => setChallanNo(e.target.value)} placeholder="Leave empty to number it automatically" />
      </label>
      <p className="muted small">This process then no longer uses our machines; the delivery forecast waits for the job worker instead.</p>
      <div className="btn-row">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={!workerId || !(Number(qty) > 0) || !expectedBack}
          onClick={() => {
            act('SEND_JOB_WORK', { id: order.id, process, workerId, qty: Number(qty), expectedBack, challanNo });
            onClose();
          }}
        >
          Send
        </button>
      </div>
    </Modal>
  );
}

function ReturnJobWork({ order, job, onClose }) {
  const { act } = useStore();
  const [okQty, setOkQty] = useState(String(job.qty));
  const [rejectedQty, setRejectedQty] = useState('0');
  const [note, setNote] = useState('');
  const total = Number(okQty) + Number(rejectedQty);
  return (
    <Modal title={`Received back – ${job.challanNo}`} onClose={onClose}>
      <div className="form-grid">
        <label>
          Pieces OK
          <input type="number" min="0" value={okQty} onChange={(e) => setOkQty(e.target.value)} />
        </label>
        <label>
          Pieces rejected
          <input type="number" min="0" value={rejectedQty} onChange={(e) => setRejectedQty(e.target.value)} />
        </label>
      </div>
      {total !== job.qty && <p className="field-error">{job.qty} pieces were sent – this adds up to {total}.</p>}
      <label>
        Note
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 2 pcs coating peeling" />
      </label>
      <div className="btn-row">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn success"
          disabled={Number(okQty) < 0 || Number(rejectedQty) < 0}
          onClick={() => {
            act('RETURN_JOB_WORK', { id: order.id, jobId: job.id, okQty: Number(okQty), rejectedQty: Number(rejectedQty), note: note.trim() });
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </Modal>
  );
}

function ScrapDialog({ order, onClose }) {
  const { act } = useStore();
  const { t } = useLang();
  const [qty, setQty] = useState('');
  const [code, setCode] = useState(null);
  const [note, setNote] = useState('');
  return (
    <Modal title="Report scrap / rejected pieces" onClose={onClose}>
      <label>
        How many pieces?
        <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
      </label>
      <p className="delay-step">Why?</p>
      <div className="reason-grid">
        {REASONS.qcFail.map((c) => (
          <button key={c} type="button" className={`reason-chip ${code === c ? 'on' : ''}`} aria-pressed={code === c} onClick={() => setCode(c)}>
            <span className="reason-emoji" aria-hidden="true">
              {reasonIcon(c)}
            </span>
            {t(`reason.${c}`)}
          </button>
        ))}
      </div>
      <label>
        Note
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="btn-row">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn danger"
          disabled={!(Number(qty) > 0) || !code}
          onClick={() => {
            act('REPORT_SCRAP', { id: order.id, qty: Number(qty), code, note: note.trim() });
            onClose();
          }}
        >
          Report
        </button>
      </div>
    </Modal>
  );
}
