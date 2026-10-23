import { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { PROCESSES, activeProcesses } from '../data/processes';
import { isOpen } from '../data/statuses';
import { Card, Modal, PageHeader } from '../components/ui';
import Icon from '../components/Icon';
import { fmtDate, todayISO } from '../utils';

const TABS = [
  { key: 'products', label: 'Products' },
  { key: 'processes', label: 'Processes' },
  { key: 'machines', label: 'Machines' },
  { key: 'suppliers', label: 'Suppliers' },
  { key: 'jobWorkers', label: 'Job workers' },
  { key: 'plants', label: 'Factories' },
  { key: 'calendar', label: 'Working calendar' },
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Master data the factory sets up once: what it makes, with what, where, from whom, and on which days. */
export default function Setup() {
  const [tab, setTab] = useState('products');
  const [editing, setEditing] = useState(null); // { kind, item }

  return (
    <>
      <PageHeader title="Setup" subtitle="Products, processes, machines, suppliers, job workers, factories and working days – used by orders, purchasing and capacity planning" />
      <div className="work-tabs" role="tablist" aria-label="Setup sections">
        {TABS.map((x) => (
          <button key={x.key} role="tab" aria-selected={tab === x.key} className={`work-tab ${tab === x.key ? 'active' : ''}`} onClick={() => setTab(x.key)}>
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'products' && <Products onEdit={(item) => setEditing({ kind: 'products', item })} />}
      {tab === 'machines' && <Machines onEdit={(item) => setEditing({ kind: 'machines', item })} />}
      {tab === 'suppliers' && <Suppliers onEdit={(item) => setEditing({ kind: 'suppliers', item })} />}
      {tab === 'jobWorkers' && <JobWorkers onEdit={(item) => setEditing({ kind: 'jobWorkers', item })} />}
      {tab === 'plants' && <Plants onEdit={(item) => setEditing({ kind: 'plants', item })} />}
      {tab === 'calendar' && <Calendar />}
      {tab === 'processes' && <Processes />}

      {editing?.kind === 'products' && <ProductDialog item={editing.item} onClose={() => setEditing(null)} />}
      {editing?.kind === 'machines' && <MachineDialog item={editing.item} onClose={() => setEditing(null)} />}
      {editing?.kind === 'suppliers' && <SupplierDialog item={editing.item} onClose={() => setEditing(null)} />}
      {editing?.kind === 'jobWorkers' && <JobWorkerDialog item={editing.item} onClose={() => setEditing(null)} />}
      {editing?.kind === 'plants' && <PlantDialog item={editing.item} onClose={() => setEditing(null)} />}
    </>
  );
}

/* ---------------------------------------------------------------- shared bits */

function ListCard({ title, icon, onAdd, addLabel, children }) {
  return (
    <Card
      title={title}
      icon={icon}
      actions={
        <button className="btn small primary" onClick={onAdd}>
          <Icon name="plus" size={14} /> {addLabel}
        </button>
      }
    >
      <div className="table-wrap">{children}</div>
    </Card>
  );
}

/** Save / delete footer. `blockDelete` explains why something cannot be deleted (e.g. still in use). */
function DialogFooter({ onClose, onSave, saveDisabled, onDelete, blockDelete }) {
  return (
    <>
      {onDelete && blockDelete && <p className="muted small">Can't delete: {blockDelete}</p>}
      <div className="btn-row">
        {onDelete && (
          <button className="btn danger" disabled={Boolean(blockDelete)} onClick={() => window.confirm('Delete this record?') && onDelete()}>
            Delete
          </button>
        )}
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" disabled={saveDisabled} onClick={onSave}>
          Save
        </button>
      </div>
    </>
  );
}

const useSave = (kind, onClose) => {
  const { act } = useStore();
  return {
    save: (item) => {
      act('SAVE_MASTER', { kind, item });
      onClose();
    },
    remove: (id) => {
      act('DELETE_MASTER', { kind, itemId: id });
      onClose();
    },
  };
};

/* ---------------------------------------------------------------- products */

function Products({ onEdit }) {
  const { state } = useStore();
  const material = (id) => state.materials.find((m) => m.id === id);
  return (
    <ListCard title={`Products (${state.products.length})`} icon="box" addLabel="Add product" onAdd={() => onEdit({ name: '', bom: {}, route: {} })}>
      <table className="table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Raw material per unit (bill of materials)</th>
            <th>Process route – machine hours per unit</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {state.products.map((p) => (
            <tr key={p.id}>
              <td>
                <strong>{p.name}</strong>
                <div className="muted small">{p.id}</div>
              </td>
              <td className="small">
                {Object.entries(p.bom).map(([rm, q]) => (
                  <div key={rm}>
                    {material(rm)?.name ?? rm}: {q} {material(rm)?.unit}
                  </div>
                ))}
              </td>
              <td className="small">
                {Object.entries(p.route ?? {}).map(([proc, h]) => (
                  <div key={proc}>
                    {PROCESSES[proc]?.label ?? proc}: {h} h
                  </div>
                ))}
              </td>
              <td>
                <button className="btn small" onClick={() => onEdit(p)}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ListCard>
  );
}

function ProductDialog({ item, onClose }) {
  const { state } = useStore();
  const { save, remove } = useSave('products', onClose);
  const [name, setName] = useState(item.name);
  const [bom, setBom] = useState(() => Object.entries(item.bom).map(([rmId, q]) => ({ rmId, q: String(q) })));
  const [route, setRoute] = useState(() => Object.fromEntries(activeProcesses().map(([k]) => [k, item.route?.[k] != null ? String(item.route[k]) : ''])));
  const inUse = item.id && state.orders.some((o) => isOpen(o) && o.items.some((it) => it.productId === item.id));
  const lines = bom.filter((b) => b.rmId && Number(b.q) > 0);
  const valid = name.trim() && lines.length > 0;

  return (
    <Modal title={item.id ? `Edit ${item.id}` : 'New product'} onClose={onClose}>
      <label>
        Product name
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <fieldset className="receive-line">
        <legend>Raw material for one unit</legend>
        {bom.map((b, i) => (
          <div key={i} className="bom-line">
            <select value={b.rmId} onChange={(e) => setBom((x) => x.map((y, j) => (j === i ? { ...y, rmId: e.target.value } : y)))} aria-label="Material">
              <option value="">Choose material…</option>
              {state.materials.map((m) => (
                <option key={m.id} value={m.id} disabled={bom.some((y, j) => j !== i && y.rmId === m.id)}>
                  {m.name} ({m.unit})
                </option>
              ))}
            </select>
            <input type="number" min="0" step="any" value={b.q} onChange={(e) => setBom((x) => x.map((y, j) => (j === i ? { ...y, q: e.target.value } : y)))} aria-label="Quantity per unit" />
            <button type="button" className="icon-btn" aria-label="Remove material" onClick={() => setBom((x) => x.filter((_, j) => j !== i))}>
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
        <button type="button" className="link-btn small" onClick={() => setBom((x) => [...x, { rmId: '', q: '' }])}>
          + Add material
        </button>
      </fieldset>
      <fieldset className="receive-line">
        <legend>Machine hours per unit (leave empty if the process is not used)</legend>
        <div className="form-grid">
          {activeProcesses().map(([k, pr]) => (
            <label key={k}>
              {pr.label}
              <input type="number" min="0" step="any" value={route[k]} onChange={(e) => setRoute((r) => ({ ...r, [k]: e.target.value }))} />
            </label>
          ))}
        </div>
      </fieldset>
      <DialogFooter
        onClose={onClose}
        saveDisabled={!valid}
        onSave={() =>
          save({
            ...item,
            name: name.trim(),
            bom: Object.fromEntries(lines.map((b) => [b.rmId, Number(b.q)])),
            route: Object.fromEntries(Object.entries(route).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)])),
          })
        }
        onDelete={item.id && (() => remove(item.id))}
        blockDelete={inUse && 'it is on open work orders.'}
      />
    </Modal>
  );
}

/* ---------------------------------------------------------------- machines */

function Machines({ onEdit }) {
  const { state } = useStore();
  return (
    <ListCard
      title={`Machines (${state.machines.length})`}
      icon="cog"
      addLabel="Add machine"
      onAdd={() => onEdit({ name: '', plantId: state.plants[0].id, process: 'cutting', hoursPerDay: 8, maintenanceEveryDays: 30, lastMaintenance: todayISO() })}
    >
      <table className="table">
        <thead>
          <tr>
            <th>Machine</th>
            <th>Factory</th>
            <th>Process</th>
            <th className="num">Hours / day</th>
            <th>Maintenance</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {state.machines.map((m) => (
            <tr key={m.id}>
              <td>
                <strong>{m.name}</strong>
                <div className="muted small">{m.id}</div>
              </td>
              <td className="small">{state.plants.find((p) => p.id === m.plantId)?.name}</td>
              <td className="small">{PROCESSES[m.process]?.label}</td>
              <td className="num">{m.hoursPerDay}</td>
              <td className="small">
                Every {m.maintenanceEveryDays} days · last {fmtDate(m.lastMaintenance)}
              </td>
              <td>
                <button className="btn small" onClick={() => onEdit(m)}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ListCard>
  );
}

function MachineDialog({ item, onClose }) {
  const { state } = useStore();
  const { save, remove } = useSave('machines', onClose);
  const [m, setM] = useState({ ...item, hoursPerDay: String(item.hoursPerDay), maintenanceEveryDays: String(item.maintenanceEveryDays) });
  const set = (k, v) => setM((x) => ({ ...x, [k]: v }));
  const valid = m.name.trim() && Number(m.hoursPerDay) > 0 && Number(m.hoursPerDay) <= 24 && Number(m.maintenanceEveryDays) > 0 && m.lastMaintenance;
  return (
    <Modal title={item.id ? `Edit ${item.name}` : 'New machine'} onClose={onClose}>
      <label>
        Name
        <input value={m.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder="e.g. Press brake PB-3" />
      </label>
      <div className="form-grid">
        <label>
          Factory
          <select value={m.plantId} onChange={(e) => set('plantId', e.target.value)}>
            {state.plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Process
          <select value={m.process} onChange={(e) => set('process', e.target.value)}>
            {activeProcesses().map(([k, p]) => (
              <option key={k} value={k}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Hours per working day
          <input type="number" min="1" max="24" value={m.hoursPerDay} onChange={(e) => set('hoursPerDay', e.target.value)} />
          <small className="hint">8 = one shift, 16 = two shifts</small>
        </label>
        <label>
          Maintenance every (days)
          <input type="number" min="1" value={m.maintenanceEveryDays} onChange={(e) => set('maintenanceEveryDays', e.target.value)} />
        </label>
        <label>
          Last maintenance
          <input type="date" max={todayISO()} value={m.lastMaintenance} onChange={(e) => set('lastMaintenance', e.target.value)} />
        </label>
      </div>
      <DialogFooter
        onClose={onClose}
        saveDisabled={!valid}
        onSave={() => save({ ...m, name: m.name.trim(), hoursPerDay: Number(m.hoursPerDay), maintenanceEveryDays: Number(m.maintenanceEveryDays) })}
        onDelete={item.id && (() => remove(item.id))}
      />
    </Modal>
  );
}

/* ---------------------------------------------------------------- suppliers & job workers */

function Suppliers({ onEdit }) {
  const { state } = useStore();
  return (
    <ListCard title={`Suppliers (${state.suppliers.length})`} icon="cart" addLabel="Add supplier" onAdd={() => onEdit({ name: '', phone: '', materials: [], leadDays: 3 })}>
      <table className="table">
        <thead>
          <tr>
            <th>Supplier</th>
            <th>Supplies</th>
            <th className="num">Lead time</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {state.suppliers.map((s) => (
            <tr key={s.id}>
              <td>
                <strong>{s.name}</strong>
                <div className="muted small">{s.phone}</div>
              </td>
              <td className="small">{s.materials.map((id) => state.materials.find((m) => m.id === id)?.name).join(', ') || '—'}</td>
              <td className="num">{s.leadDays} days</td>
              <td>
                <button className="btn small" onClick={() => onEdit(s)}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ListCard>
  );
}

function SupplierDialog({ item, onClose }) {
  const { state } = useStore();
  const { save, remove } = useSave('suppliers', onClose);
  const [s, setS] = useState({ ...item, leadDays: String(item.leadDays) });
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const openPos = item.id && state.purchases.some((p) => p.supplierId === item.id && p.status === 'SENT');
  const valid = s.name.trim() && Number(s.leadDays) >= 0 && s.materials.length > 0;
  return (
    <Modal title={item.id ? `Edit ${item.name}` : 'New supplier'} onClose={onClose}>
      <label>
        Name
        <input value={s.name} onChange={(e) => set('name', e.target.value)} autoFocus />
      </label>
      <div className="form-grid">
        <label>
          Phone
          <input type="tel" value={s.phone} onChange={(e) => set('phone', e.target.value)} />
        </label>
        <label>
          Usual lead time (days)
          <input type="number" min="0" value={s.leadDays} onChange={(e) => set('leadDays', e.target.value)} />
        </label>
      </div>
      <fieldset className="checks">
        <legend>Materials they supply</legend>
        {state.materials.map((m) => (
          <label key={m.id} className={`check ${s.materials.includes(m.id) ? 'checked' : ''}`}>
            <input
              type="checkbox"
              checked={s.materials.includes(m.id)}
              onChange={(e) => set('materials', e.target.checked ? [...s.materials, m.id] : s.materials.filter((x) => x !== m.id))}
            />
            {m.name}
          </label>
        ))}
      </fieldset>
      <DialogFooter
        onClose={onClose}
        saveDisabled={!valid}
        onSave={() => save({ ...s, name: s.name.trim(), phone: s.phone.trim(), leadDays: Number(s.leadDays) })}
        onDelete={item.id && (() => remove(item.id))}
        blockDelete={openPos && 'it has open purchase orders.'}
      />
    </Modal>
  );
}

function JobWorkers({ onEdit }) {
  const { state } = useStore();
  return (
    <ListCard
      title={`Job workers (${state.jobWorkers.length})`}
      icon="truck"
      addLabel="Add job worker"
      onAdd={() => onEdit({ name: '', phone: '', process: 'coating', leadDays: 3 })}
    >
      <table className="table">
        <thead>
          <tr>
            <th>Job worker</th>
            <th>Process they do for us</th>
            <th className="num">Usual turnaround</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {state.jobWorkers.map((w) => (
            <tr key={w.id}>
              <td>
                <strong>{w.name}</strong>
                <div className="muted small">{w.phone}</div>
              </td>
              <td className="small">{PROCESSES[w.process]?.label}</td>
              <td className="num">{w.leadDays} days</td>
              <td>
                <button className="btn small" onClick={() => onEdit(w)}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ListCard>
  );
}

function JobWorkerDialog({ item, onClose }) {
  const { state } = useStore();
  const { save, remove } = useSave('jobWorkers', onClose);
  const [w, setW] = useState({ ...item, leadDays: String(item.leadDays) });
  const set = (k, v) => setW((x) => ({ ...x, [k]: v }));
  const out = item.id && state.orders.some((o) => (o.jobWork ?? []).some((j) => j.workerId === item.id && j.status === 'OUT'));
  return (
    <Modal title={item.id ? `Edit ${item.name}` : 'New job worker'} onClose={onClose}>
      <label>
        Name
        <input value={w.name} onChange={(e) => set('name', e.target.value)} autoFocus />
      </label>
      <div className="form-grid">
        <label>
          Phone
          <input type="tel" value={w.phone} onChange={(e) => set('phone', e.target.value)} />
        </label>
        <label>
          Process
          <select value={w.process} onChange={(e) => set('process', e.target.value)}>
            {activeProcesses().map(([k, p]) => (
              <option key={k} value={k}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Usual turnaround (days)
          <input type="number" min="0" value={w.leadDays} onChange={(e) => set('leadDays', e.target.value)} />
        </label>
      </div>
      <DialogFooter
        onClose={onClose}
        saveDisabled={!w.name.trim()}
        onSave={() => save({ ...w, name: w.name.trim(), phone: w.phone.trim(), leadDays: Number(w.leadDays) })}
        onDelete={item.id && (() => remove(item.id))}
        blockDelete={out && 'material is with them right now.'}
      />
    </Modal>
  );
}

/* ---------------------------------------------------------------- factories */

function Plants({ onEdit }) {
  const { state } = useStore();
  return (
    <ListCard title={`Factories (${state.plants.length})`} icon="factory" addLabel="Add factory" onAdd={() => onEdit({ name: '', city: '' })}>
      <table className="table">
        <thead>
          <tr>
            <th>Factory</th>
            <th className="num">Machines</th>
            <th className="num">Open work orders</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {state.plants.map((p) => (
            <tr key={p.id}>
              <td>
                <strong>{p.name}</strong>
                <div className="muted small">{p.city}</div>
              </td>
              <td className="num">{state.machines.filter((m) => m.plantId === p.id).length}</td>
              <td className="num">{state.orders.filter((o) => o.plantId === p.id && isOpen(o)).length}</td>
              <td>
                <button className="btn small" onClick={() => onEdit(p)}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ListCard>
  );
}

function PlantDialog({ item, onClose }) {
  const { state } = useStore();
  const { save, remove } = useSave('plants', onClose);
  const [p, setP] = useState(item);
  const used =
    item.id &&
    (state.orders.some((o) => o.plantId === item.id) || state.machines.some((m) => m.plantId === item.id) || state.lots.some((l) => l.plantId === item.id && l.qty > 0));
  return (
    <Modal title={item.id ? `Edit ${item.name}` : 'New factory'} onClose={onClose}>
      <div className="form-grid">
        <label>
          Name
          <input value={p.name} onChange={(e) => setP((x) => ({ ...x, name: e.target.value }))} autoFocus />
        </label>
        <label>
          City
          <input value={p.city} onChange={(e) => setP((x) => ({ ...x, city: e.target.value }))} />
        </label>
      </div>
      <DialogFooter
        onClose={onClose}
        saveDisabled={!p.name.trim()}
        onSave={() => save({ ...p, name: p.name.trim(), city: p.city.trim() })}
        onDelete={item.id && state.plants.length > 1 && (() => remove(item.id))}
        blockDelete={used && 'it has work orders, machines or stock.'}
      />
    </Modal>
  );
}

/* ---------------------------------------------------------------- calendar */

function Calendar() {
  const { state, act } = useStore();
  const cal = state.settings.calendar;
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const setCal = (calendar) => act('SET_CALENDAR', { calendar });
  const holidays = [...cal.holidays].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="grid-2">
      <Card title="Working days" icon="calendar">
        <p className="muted small">Capacity planning and delivery forecasts only count these days.</p>
        <fieldset className="checks">
          <legend className="sr-only">Working days</legend>
          {WEEKDAYS.map((d, i) => (
            <label key={d} className={`check ${cal.workDays.includes(i) ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={cal.workDays.includes(i)}
                disabled={cal.workDays.length === 1 && cal.workDays.includes(i)}
                onChange={(e) => setCal({ ...cal, workDays: e.target.checked ? [...cal.workDays, i].sort() : cal.workDays.filter((x) => x !== i) })}
              />
              {d}
            </label>
          ))}
        </fieldset>
      </Card>
      <Card title={`Holidays (${holidays.length})`} icon="calendar">
        <form
          className="holiday-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!date || cal.holidays.some((h) => h.date === date)) return;
            setCal({ ...cal, holidays: [...cal.holidays, { date, name: name.trim() || 'Holiday' }] });
            setDate('');
            setName('');
          }}
        >
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Holiday date" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pongal" aria-label="Holiday name" />
          <button className="btn primary" disabled={!date}>
            Add
          </button>
        </form>
        <ul className="feed">
          {holidays.map((h) => (
            <li key={h.date} className="row-between">
              <span>
                <strong>{fmtDate(h.date)}</strong> · {h.name}
              </span>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove ${h.name}`}
                onClick={() => setCal({ ...cal, holidays: cal.holidays.filter((x) => x.date !== h.date) })}
              >
                <Icon name="x" size={16} />
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- processes */

/** Machine processes (work centres): rename, add, remove. Machines, job workers and product routes use them. */
function Processes() {
  const { state, act } = useStore();
  const [draft, setDraft] = useState(() => activeProcesses().map(([key, p]) => ({ key, label: p.label })));
  const usedBy = (key) => {
    const machines = state.machines.filter((m) => m.process === key).length;
    const workers = state.jobWorkers.filter((w) => w.process === key).length;
    const products = state.products.filter((pr) => Number(pr.route?.[key]) > 0).length;
    return [machines && `${machines} machine${machines > 1 ? 's' : ''}`, workers && `${workers} job worker${workers > 1 ? 's' : ''}`, products && `${products} product${products > 1 ? 's' : ''}`]
      .filter(Boolean)
      .join(', ');
  };
  const names = draft.map((d) => d.label.trim().toLowerCase());
  const problem = names.some((n) => !n) ? 'Every process needs a name.' : new Set(names).size !== names.length ? 'Two processes have the same name.' : '';
  const saved = activeProcesses().map(([key, p]) => ({ key, label: p.label }));
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);

  const save = () => {
    // Active processes in the order shown; removed ones stay in the map, marked, so old time logs and job
    // work keep their names.
    const ordered = {};
    draft.forEach((d, i) => {
      const key = d.key ?? `p_${Date.now().toString(36)}${i}`;
      ordered[key] = { ...state.processes[key], label: d.label.trim(), removed: false };
    });
    Object.entries(state.processes).forEach(([k, p]) => !ordered[k] && (ordered[k] = { ...p, removed: true }));
    act('SAVE_PROCESSES', { processes: ordered });
    setDraft(Object.entries(ordered).filter(([, p]) => !p.removed).map(([key, p]) => ({ key, label: p.label })));
  };

  return (
    <Card title="Processes" icon="cog">
      <p className="muted small">
        The work done on machines – cutting, welding, painting, assembly… Each machine and job worker does one process, and each product
        lists the hours it needs per process. A process can be removed once no machine, job worker or product uses it.
      </p>
      <ol className="stage-list">
        {draft.map((d, i) => {
          const used = d.key ? usedBy(d.key) : '';
          return (
            <li key={d.key ?? `new-${i}`} className="stage-row">
              <span className="stage-no">{i + 1}</span>
              <input
                value={d.label}
                aria-label={`Process ${i + 1} name`}
                placeholder="Process name"
                onChange={(e) => setDraft((all) => all.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              <span className="muted small">{used ? `Used by ${used}` : 'Not used yet'}</span>
              <span className="stage-tools">
                <button
                  type="button"
                  className="icon-btn danger"
                  disabled={Boolean(used)}
                  title={used ? `Used by ${used} – change those first` : 'Remove process'}
                  aria-label={`Remove ${d.label}`}
                  onClick={() => setDraft((all) => all.filter((_, j) => j !== i))}
                >
                  <Icon name="x" size={16} />
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      <button type="button" className="btn" onClick={() => setDraft((all) => [...all, { label: '' }])}>
        <Icon name="plus" size={16} /> Add process
      </button>
      {problem && <p className="field-error">{problem}</p>}
      <div className="btn-row">
        <button className="btn primary" disabled={!changed || Boolean(problem)} onClick={save}>
          Save processes
        </button>
        <button className="btn ghost" disabled={!changed} onClick={() => setDraft(saved)}>
          Discard changes
        </button>
      </div>
    </Card>
  );
}
