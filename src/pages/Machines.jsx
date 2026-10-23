import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useStore, useVisibleMachines } from '../context/StoreContext';
import { can } from '../auth/permissions';
import { PROCESSES, activeProcesses } from '../data/processes';
import { dailyHours, machineIsDown, machineLoad, maintenanceStatus, remainingHours, uptime } from '../data/planning';
import { isOpen } from '../data/statuses';
import { Card, EmptyState, Modal, PageHeader, StatTiles } from '../components/ui';
import VoiceInput from '../components/VoiceInput';
import Icon from '../components/Icon';
import { fmtDate, fmtDateTime } from '../utils';

/** Machines per factory: capacity by process, load for the next 7 days, uptime, breakdowns and maintenance. */
export default function Machines() {
  const { user } = useAuth();
  const { state, act, plant } = useStore();
  const machines = useVisibleMachines();
  const manage = can(user.role, 'machines.manage');
  const load = machineLoad(state);
  const [downFor, setDownFor] = useState(null);
  const [show, setShow] = useState('all'); // all | down | service
  const plants = state.plants.filter((p) => plant === 'all' || p.id === plant);

  // Queued hours per factory and process, and how many working days that is.
  const queued = {};
  state.orders.filter(isOpen).forEach((o) =>
    Object.entries(remainingHours(o, state.products)).forEach(([proc, h]) => {
      queued[`${o.plantId}:${proc}`] = (queued[`${o.plantId}:${proc}`] ?? 0) + h;
    }),
  );

  const down = machines.filter(machineIsDown).length;
  const dueSoon = machines.filter((m) => maintenanceStatus(m).state !== 'ok').length;
  const shown = machines.filter(
    (m) => show === 'all' || (show === 'down' && machineIsDown(m)) || (show === 'service' && maintenanceStatus(m).state !== 'ok'),
  );
  const toggle = (key) => setShow((s) => (s === key ? 'all' : key));
  // Breakdowns in the last 30 days, newest first, with how long each machine was stopped.
  const since = Date.now() - 30 * 86400000;
  const breakdowns = machines
    .flatMap((m) => m.downtime.filter((d) => Date.parse(d.to ?? new Date().toISOString()) >= since).map((d) => ({ ...d, machine: m })))
    .sort((a, b) => b.from.localeCompare(a.from));
  const hoursOf = (d) => Math.round((Date.parse(d.to ?? new Date().toISOString()) - Date.parse(d.from)) / 360000) / 10;

  return (
    <>
      <PageHeader title="Machines" subtitle="Capacity per process, load, breakdowns and maintenance – used to forecast delivery dates." />

      <StatTiles
        label="Machine summary"
        items={[
          { key: 'all', label: 'Machines', value: machines.length, icon: 'cog', tone: 'blue', active: show === 'all', onClick: () => setShow('all') },
          { key: 'run', label: 'Running', value: machines.length - down, icon: 'checkCircle', tone: 'green' },
          { key: 'down', label: 'Down now', value: down, icon: 'alert', tone: down ? 'red' : 'gray', active: show === 'down', onClick: () => toggle('down') },
          { key: 'service', label: 'Maintenance due', value: dueSoon, icon: 'clock', tone: dueSoon ? 'amber' : 'gray', active: show === 'service', onClick: () => toggle('service') },
        ]}
      />

      <Card title="Capacity by process" icon="layers">
        <p className="muted small">Work already booked on open orders, and how many working days it takes with the machines that are running now.</p>
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th scope="col">Factory</th>
                <th scope="col">Process</th>
                <th scope="col" className="num">
                  Running machines
                </th>
                <th scope="col" className="num">
                  Hours / day
                </th>
                <th scope="col" className="num">
                  Work queued (h)
                </th>
                <th scope="col">Days of work</th>
              </tr>
            </thead>
            <tbody>
              {plants.flatMap((pl) =>
                activeProcesses().map(([k]) => k)
                  .filter((proc) => state.machines.some((m) => m.plantId === pl.id && m.process === proc))
                  .map((proc) => {
                    const all = state.machines.filter((m) => m.plantId === pl.id && m.process === proc);
                    const perDay = dailyHours(state.machines, pl.id, proc);
                    const hours = Math.round((queued[`${pl.id}:${proc}`] ?? 0) * 10) / 10;
                    const days = perDay ? Math.ceil(hours / perDay) : null;
                    return (
                      <tr key={`${pl.id}:${proc}`}>
                        <td className="small">{pl.name}</td>
                        <td>{PROCESSES[proc].label}</td>
                        <td className={`num ${all.some(machineIsDown) ? 'bad-text' : ''}`}>
                          {all.filter((m) => !machineIsDown(m)).length} / {all.length}
                        </td>
                        <td className="num">{perDay}</td>
                        <td className="num">{hours}</td>
                        <td>
                          {days == null ? (
                            <span className="badge tone-red">Stopped – all machines down</span>
                          ) : (
                            <span className="days-load">
                              <span className={`level-bar ${days > 5 ? 'low' : days > 2 ? 'mid' : ''}`}>
                                <span style={{ width: `${Math.min(100, (days / 10) * 100)}%` }} />
                              </span>
                              <span className={`small ${days > 5 ? 'bad-text' : days > 2 ? 'warn-text' : 'muted'}`}>
                                {days} day{days === 1 ? '' : 's'}
                              </span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  }),
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {plants.filter((pl) => shown.some((m) => m.plantId === pl.id)).map((pl) => (
        <Card key={pl.id} title={`${pl.name} · ${pl.city}`} icon="factory">
          <div className="machine-grid">
            {shown
              .filter((m) => m.plantId === pl.id)
              .map((m) => {
                const isDown = machineIsDown(m);
                const open = m.downtime.find((d) => !d.to);
                const mt = maintenanceStatus(m);
                const l = load[m.id];
                return (
                  <article key={m.id} className={`machine ${isDown ? 'down' : ''}`}>
                    <header className="row-between">
                      <strong>{m.name}</strong>
                      <span className={`badge tone-${isDown ? 'red' : 'green'}`}>{isDown ? 'Down' : 'Running'}</span>
                    </header>
                    <span className="muted small">
                      {PROCESSES[m.process].label} · {m.hoursPerDay} h/day
                    </span>
                    {isDown && (
                      <p className="machine-down small">
                        Since {fmtDateTime(open.from)}: {open.reason}
                      </p>
                    )}
                    <div className="machine-stat">
                      <span>Load, next 7 days</span>
                      <span className="meter-row">
                        <span className="meter neutral" role="presentation">
                          <span style={{ width: `${Math.min(100, l.pct)}%` }} className={l.pct > 90 ? 'hot' : ''} />
                        </span>
                        <strong>{isDown ? '—' : `${l.pct}%`}</strong>
                      </span>
                    </div>
                    <div className="machine-stat">
                      <span>Uptime, last 30 days</span>
                      <strong className={uptime(m) < 95 ? 'bad-text' : ''}>{uptime(m)}%</strong>
                    </div>
                    <div className="machine-stat">
                      <span>Next maintenance</span>
                      <span className={`badge tone-${mt.state === 'overdue' ? 'red' : mt.state === 'soon' ? 'amber' : 'gray'}`}>
                        {fmtDate(mt.due)} {mt.state === 'overdue' ? `· ${-mt.days} days overdue` : mt.state === 'soon' ? `· in ${mt.days} days` : ''}
                      </span>
                    </div>
                    {manage && (
                      <div className="btn-row tight">
                        {isDown ? (
                          <button className="btn small success" onClick={() => act('MACHINE_UP', { machineId: m.id })}>
                            <Icon name="check" size={14} /> Running again
                          </button>
                        ) : (
                          <button className="btn small danger" onClick={() => setDownFor(m)}>
                            Mark down
                          </button>
                        )}
                        <button
                          className="btn small"
                          onClick={() => window.confirm(`Record maintenance done today on ${m.name}?`) && act('MAINTENANCE_DONE', { machineId: m.id })}
                        >
                          <Icon name="cog" size={14} /> Maintenance done
                        </button>
                      </div>
                    )}
                    {m.maintenanceLog[0] && (
                      <span className="muted small">
                        Last serviced by {m.maintenanceLog[0].by}, {fmtDate(m.maintenanceLog[0].at)}
                      </span>
                    )}
                  </article>
                );
              })}
          </div>
        </Card>
      ))}

      <Card title="Breakdowns – last 30 days" icon="alert">
        {breakdowns.length === 0 ? (
          <EmptyState icon="checkCircle" title="No breakdowns in the last 30 days" />
        ) : (
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Reason</th>
                  <th>Down from</th>
                  <th>Back running</th>
                  <th className="num">Hours lost</th>
                </tr>
              </thead>
              <tbody>
                {breakdowns.map((d, i) => (
                  <tr key={i} className={d.to ? '' : 'row-low'}>
                    <td data-label="Machine">
                      <strong>{d.machine.name}</strong>
                      <div className="muted small">{PROCESSES[d.machine.process]?.label}</div>
                    </td>
                    <td data-label="Reason">{d.reason}</td>
                    <td data-label="Down from" className="small">
                      {fmtDateTime(d.from)}
                    </td>
                    <td data-label="Back running" className="small">
                      {d.to ? fmtDateTime(d.to) : <span className="bad-text">Still down</span>}
                    </td>
                    <td data-label="Hours lost" className="num">
                      {hoursOf(d)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {downFor && <DownDialog machine={downFor} onClose={() => setDownFor(null)} />}
    </>
  );
}

function DownDialog({ machine, onClose }) {
  const { act } = useStore();
  const [reason, setReason] = useState('');
  const quick = ['Breakdown', 'No power', 'No operator', 'Tool / die change', 'Planned maintenance'];
  return (
    <Modal title={`${machine.name} is down`} onClose={onClose}>
      <div className="chips">
        {quick.map((q) => (
          <button key={q} type="button" className={`chip ${reason === q ? 'active' : ''}`} onClick={() => setReason(q)}>
            {q}
          </button>
        ))}
      </div>
      <label>
        What happened?
        <span className="with-voice">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Hydraulic leak" />
          <VoiceInput onText={(txt) => setReason((r) => (r ? `${r} ${txt}` : txt))} />
        </span>
      </label>
      <p className="muted small">Orders that need this process will show a later forecast until the machine runs again.</p>
      <div className="btn-row">
        <button className="btn ghost lg" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn danger lg"
          disabled={!reason.trim()}
          onClick={() => {
            act('MACHINE_DOWN', { machineId: machine.id, reason: reason.trim() });
            onClose();
          }}
        >
          Mark down
        </button>
      </div>
    </Modal>
  );
}
