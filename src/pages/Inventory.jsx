import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../i18n';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { can } from '../auth/permissions';
import { incoming, ordersUsingBatch, poRemaining, stockAt } from '../data/stock';
import { Card, EmptyState, Modal, PageHeader, StatTiles } from '../components/ui';
import DeliveryCheck, { reservedStock } from '../components/DeliveryCheck';
import Icon from '../components/Icon';
import { fmtDate, fmtDateTime } from '../utils';

/** Raw material stock per factory, batches, transfers between factories and batch traceability. */
export default function Inventory() {
  const { t } = useLang();
  const { user } = useAuth();
  const { state, plant } = useStore();
  const canManage = can(user.role, 'inventory.manage');
  const [dialog, setDialog] = useState(null); // { type: 'receive' | 'transfer' | 'add', material }
  const [trace, setTrace] = useState('');
  const [search, setSearch] = useState('');
  const [show, setShow] = useState('all'); // all | low | transit
  const material = (id) => state.materials.find((m) => m.id === id);
  const plants = state.plants.filter((p) => plant === 'all' || p.id === plant);
  const lowCount = state.materials.filter((m) => m.stock <= m.reorderLevel).length;
  const lots = state.lots.filter((l) => l.qty > 0 && (plant === 'all' || l.plantId === plant)).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const traced = trace.trim().length >= 3 ? ordersUsingBatch(state.orders, trace) : [];

  // What is not yet promised: stock in view minus what orders waiting for factory review will use.
  const reserved = reservedStock(state, plant === 'all' ? null : plant);
  const inView = (m) => (plant === 'all' ? m.stock : stockAt(state.lots, m.id, plant));
  const free = (m) => Math.max(0, inView(m) - (reserved[m.id] ?? 0));
  const transitOf = (m) => incoming(state.purchases, m.id, plant === 'all' ? null : plant).transit;
  const term = search.trim().toLowerCase();
  const rows = state.materials.filter(
    (m) =>
      (!term || `${m.name} ${m.id}`.toLowerCase().includes(term)) &&
      (show === 'all' || (show === 'low' && m.stock <= m.reorderLevel) || (show === 'transit' && transitOf(m) > 0)),
  );
  const transitCount = state.materials.filter((m) => transitOf(m) > 0).length;
  const toggle = (key) => setShow((s) => (s === key ? 'all' : key));

  return (
    <>
      <PageHeader title={t('nav.inventory')} subtitle="Stock in each factory, kept by batch. Orders use the oldest batch first.">
        {canManage && (
          <button className="btn primary" onClick={() => setDialog({ type: 'add' })}>
            <Icon name="plus" size={16} /> Add raw material
          </button>
        )}
      </PageHeader>

      <StatTiles
        label="Raw material summary"
        items={[
          { key: 'all', label: 'Raw materials', value: state.materials.length, icon: 'box', tone: 'blue', active: show === 'all', onClick: () => setShow('all') },
          { key: 'low', label: 'Below reorder level', value: lowCount, icon: 'alert', tone: lowCount ? 'red' : 'green', active: show === 'low', onClick: () => toggle('low') },
          { key: 'transit', label: 'Arriving (in transit)', value: transitCount, icon: 'truck', tone: 'violet', active: show === 'transit', onClick: () => toggle('transit') },
          { key: 'lots', label: 'Batches in stock', value: lots.length, icon: 'layers', tone: 'teal' },
        ]}
      />

      {can(user.role, 'orders.create') && <DeliveryCheck />}

      <Card
        title="Stock levels"
        icon="box"
        actions={
          <label className="search-field compact">
            <span className="sr-only">Search raw materials</span>
            <Icon name="search" size={15} />
            <input type="search" placeholder="Search material…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
        }
      >
        <div className="table-wrap">
          <table className="table stock-table">
            <thead>
              <tr>
                <th scope="col">Material</th>
                {plants.map((p) => (
                  <th key={p.id} scope="col" className="num">
                    {p.name}
                  </th>
                ))}
                {plants.length > 1 && (
                  <th scope="col" className="num">
                    Total
                  </th>
                )}
                <th scope="col" className="num" title="Stock not yet promised to orders waiting for factory review">
                  Free to promise
                </th>
                <th scope="col" className="num">
                  In transit
                </th>
                <th scope="col" className="num">
                  On order
                </th>
                <th scope="col">Level</th>
                {canManage && (
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="muted center">
                    No raw material matches.
                  </td>
                </tr>
              )}
              {rows.map((m) => {
                const low = m.stock <= m.reorderLevel;
                const level = Math.min(100, Math.round((m.stock / (m.reorderLevel * 2 || 1)) * 100));
                return (
                  <tr key={m.id} className={low ? 'row-low' : ''}>
                    <td data-label="Material">
                      <strong>{m.name}</strong>
                      <div className="muted small">
                        {m.id} · reorder at {m.reorderLevel} {m.unit}
                      </div>
                    </td>
                    {plants.map((p) => (
                      <td key={p.id} data-label={p.name} className="num">
                        {stockAt(state.lots, m.id, p.id).toLocaleString('en-IN')} <span className="muted small">{m.unit}</span>
                      </td>
                    ))}
                    {plants.length > 1 && (
                      <td data-label="Total" className="num">
                        <strong>{m.stock.toLocaleString('en-IN')}</strong> <span className="muted small">{m.unit}</span>
                      </td>
                    )}
                    <td data-label="Free to promise" className="num">
                      <span className={free(m) < inView(m) ? 'warn-text' : ''}>{free(m).toLocaleString('en-IN')}</span> <span className="muted small">{m.unit}</span>
                    </td>
                    <IncomingCells material={m} plantId={plant === 'all' ? null : plant} />
                    <td data-label="Level" className="level-cell">
                      <span className={`level-bar ${low ? 'low' : level < 75 ? 'mid' : ''}`} title={`${m.stock} of ${m.reorderLevel * 2} ${m.unit} (twice the reorder level)`}>
                        <span style={{ width: `${level}%` }} />
                      </span>
                      <span className={`small ${low ? 'bad-text' : 'muted'}`}>{low ? 'Low – reorder' : 'OK'}</span>
                    </td>
                    {canManage && (
                      <td>
                        <div className="btn-row tight">
                          <button className="btn small" onClick={() => setDialog({ type: 'receive', material: m })} aria-label={`Receive stock for ${m.name}`}>
                            <Icon name="plus" size={14} /> Receive
                          </button>
                          {state.plants.length > 1 && (
                            <button className="btn small" onClick={() => setDialog({ type: 'transfer', material: m })} aria-label={`Transfer ${m.name} between factories`}>
                              <Icon name="truck" size={14} /> Transfer
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {(can(user.role, 'purchase.view') || can(user.role, 'setup.manage')) && (
          <p className="muted small">
            {can(user.role, 'purchase.view') && (
              <>
                Purchase orders are received on the <Link to="/purchasing">Purchasing</Link> page.{' '}
              </>
            )}
            {can(user.role, 'setup.manage') && (
              <>
                Products and bills of material are in <Link to="/setup">Setup</Link>.
              </>
            )}
          </p>
        )}
      </Card>

      <div className="grid-2">
        <Card title="Trace a batch" icon="search">
          <label className="search-field">
            <span className="sr-only">Batch number</span>
            <Icon name="search" size={16} />
            <input type="search" value={trace} onChange={(e) => setTrace(e.target.value)} placeholder="Batch number, e.g. SST-2609" />
          </label>
          {trace.trim().length >= 3 &&
            (traced.length === 0 ? (
              <EmptyState title="No work order has used a batch like that yet" />
            ) : (
              <ul className="feed">
                {traced.map((u, i) => (
                  <li key={i}>
                    <Link to={`/orders/${u.order.id}`} className="feed-main">
                      {u.order.id} · {u.order.customer.name}
                    </Link>
                    <span className="feed-sub">
                      <code className="tracking">{u.batchNo}</code> · {u.qty} {material(u.rmId)?.unit} {material(u.rmId)?.name} · {u.order.status === 'DELIVERED' ? 'delivered' : 'in progress'}
                    </span>
                  </li>
                ))}
              </ul>
            ))}
          {trace.trim().length < 3 && <p className="muted small">Type at least 3 characters to see every work order that used the batch – for complaints and recalls.</p>}
        </Card>

        <Card title={`Batches in stock (${lots.length})`} icon="layers">
          {lots.length === 0 ? (
            <EmptyState title="No stock" />
          ) : (
            <div className="table-wrap batch-table">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Material</th>
                    <th>Factory</th>
                    <th className="num">Left</th>
                    <th>Received</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <button type="button" className="link-btn" onClick={() => setTrace(l.batchNo)}>
                          {l.batchNo}
                        </button>
                      </td>
                      <td className="small">{material(l.rmId)?.name}</td>
                      <td className="small">{state.plants.find((p) => p.id === l.plantId)?.name}</td>
                      <td className="num small">
                        {l.qty.toLocaleString('en-IN')} / {l.received.toLocaleString('en-IN')} {material(l.rmId)?.unit}
                      </td>
                      <td className="small">
                        {fmtDate(l.receivedAt)}
                        <div className="muted">{l.source}</div>
                        <Link to={`/lots/${l.id}/label`} className="small inline-icon">
                          <Icon name="qr" size={12} /> Label
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title="Stock movements" icon="clock">
        {state.inventoryLog.length === 0 ? (
          <p className="muted">No movements yet. Accepting an order, receiving or transferring stock records an entry here.</p>
        ) : (
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Material</th>
                  <th className="num">Change</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {state.inventoryLog.slice(0, 30).map((l) => (
                  <tr key={l.id}>
                    <td className="small nowrap">{fmtDateTime(l.at)}</td>
                    <td className="small">{material(l.rmId)?.name ?? l.rmId}</td>
                    <td className={`num ${l.change < 0 ? 'bad-text' : 'ok-text'}`}>
                      {l.change > 0 ? '+' : ''}
                      {l.change} {material(l.rmId)?.unit}
                    </td>
                    <td className="small">
                      {l.reason} <span className="muted">· {l.by}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {dialog?.type === 'receive' && <ReceiveModal material={dialog.material} onClose={() => setDialog(null)} />}
      {dialog?.type === 'transfer' && <TransferModal material={dialog.material} onClose={() => setDialog(null)} />}
      {dialog?.type === 'add' && <AddMaterialModal onClose={() => setDialog(null)} />}
    </>
  );
}

/** In-transit and ordered-not-shipped quantity for a material, with the transporter / LR numbers on the shipments. */
function IncomingCells({ material: m, plantId }) {
  const { state } = useStore();
  const { user } = useAuth();
  const toPurchasing = can(user.role, 'purchase.view');
  const { transit, ordered } = incoming(state.purchases, m.id, plantId);
  const shipments = state.purchases.filter(
    (p) => p.status === 'SENT' && p.shipment && (!plantId || p.plantId === plantId) && poRemaining(p).some((i) => i.rmId === m.id && i.qty > 0),
  );
  return (
    <>
      <td data-label="In transit" className="num">
        {transit ? (
          <>
            <strong className="transit-qty">
              🚚 {transit.toLocaleString('en-IN')} <span className="muted small">{m.unit}</span>
            </strong>
            {shipments.map((p) => {
              const Tag = toPurchasing ? Link : 'span';
              return (
                <Tag key={p.id} to={toPurchasing ? '/purchasing' : undefined} className="transit-ref" title={`${p.id} · ${p.shipment.carrier} · arrives ${fmtDate(p.shipment.eta)}`}>
                  {p.shipment.trackingId} · {fmtDate(p.shipment.eta).slice(0, 6)}
                </Tag>
              );
            })}
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td data-label="On order" className="num">
        {ordered ? (
          <>
            {ordered.toLocaleString('en-IN')} <span className="muted small">{m.unit}</span>
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
    </>
  );
}

function PlantSelect({ value, onChange, label = 'Factory' }) {
  const { state } = useStore();
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {state.plants.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReceiveModal({ material, onClose }) {
  const { state, act, plant } = useStore();
  const [plantId, setPlantId] = useState(plant !== 'all' ? plant : state.plants[0].id);
  const [qty, setQty] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [note, setNote] = useState('');
  const valid = Number(qty) > 0;
  return (
    <Modal title={`Receive stock · ${material.name}`} onClose={onClose}>
      <p className="muted small">For deliveries without a purchase order (e.g. cash purchase or returned material).</p>
      <div className="form-grid">
        <PlantSelect value={plantId} onChange={setPlantId} />
        <label>
          Quantity ({material.unit})
          <input type="number" min="0" autoFocus value={qty} onChange={(e) => setQty(e.target.value)} />
          <small className="hint">
            Now {stockAt(state.lots, material.id, plantId)} {material.unit} there
          </small>
        </label>
      </div>
      <label>
        Batch / lot number
        <input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder="From the label – leave empty to number it automatically" />
      </label>
      <label>
        Supplier / reference
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Cash purchase from local dealer" />
      </label>
      <div className="btn-row">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={!valid}
          onClick={() => {
            act('RESTOCK', { rmId: material.id, plantId, qty: Number(qty), batchNo, note: note.trim() || 'Stock received' });
            onClose();
          }}
        >
          Add to stock
        </button>
      </div>
    </Modal>
  );
}

function TransferModal({ material, onClose }) {
  const { state, act } = useStore();
  const [from, setFrom] = useState(() => [...state.plants].sort((a, b) => stockAt(state.lots, material.id, b.id) - stockAt(state.lots, material.id, a.id))[0].id);
  const [to, setTo] = useState(() => state.plants.find((p) => p.id !== from)?.id);
  const [qty, setQty] = useState('');
  const available = stockAt(state.lots, material.id, from);
  const n = Number(qty);
  const valid = n > 0 && n <= available && from !== to;
  return (
    <Modal title={`Transfer · ${material.name}`} onClose={onClose}>
      <div className="form-grid">
        <PlantSelect value={from} onChange={setFrom} label="From" />
        <PlantSelect value={to} onChange={setTo} label="To" />
      </div>
      <label>
        Quantity ({material.unit})
        <input type="number" min="0" max={available} value={qty} onChange={(e) => setQty(e.target.value)} />
        <small className={n > available ? 'field-error' : 'hint'}>
          {available} {material.unit} available at the sending factory · oldest batches go first and keep their batch numbers
        </small>
      </label>
      {from === to && <p className="field-error">Pick two different factories.</p>}
      <div className="btn-row">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={!valid}
          onClick={() => {
            act('TRANSFER_STOCK', { rmId: material.id, from, to, qty: n });
            onClose();
          }}
        >
          Transfer
        </button>
      </div>
    </Modal>
  );
}

function AddMaterialModal({ onClose }) {
  const { state, act, plant } = useStore();
  const [m, setM] = useState({ name: '', unit: 'kg', stock: '', reorderLevel: '' });
  const [plantId, setPlantId] = useState(plant !== 'all' ? plant : state.plants[0].id);
  const set = (k, v) => setM((x) => ({ ...x, [k]: v }));
  const valid = m.name.trim() && m.unit.trim() && Number(m.stock) >= 0 && Number(m.reorderLevel) >= 0;
  return (
    <Modal title="Add raw material" onClose={onClose}>
      <label>
        Name
        <input autoFocus value={m.name} onChange={(e) => set('name', e.target.value)} />
      </label>
      <div className="form-grid">
        <label>
          Unit
          <input value={m.unit} onChange={(e) => set('unit', e.target.value)} />
        </label>
        <label>
          Reorder level
          <input type="number" min="0" value={m.reorderLevel} onChange={(e) => set('reorderLevel', e.target.value)} />
        </label>
        <label>
          Opening stock
          <input type="number" min="0" value={m.stock} onChange={(e) => set('stock', e.target.value)} />
        </label>
        <PlantSelect value={plantId} onChange={setPlantId} label="Opening stock at" />
      </div>
      <div className="btn-row">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={!valid}
          onClick={() => {
            act('ADD_MATERIAL', {
              plantId,
              material: { name: m.name.trim(), unit: m.unit.trim(), stock: Number(m.stock || 0), reorderLevel: Number(m.reorderLevel || 0) },
            });
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </Modal>
  );
}
