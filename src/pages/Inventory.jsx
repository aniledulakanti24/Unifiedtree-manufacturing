import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { can } from '../auth/permissions';
import { Card, Modal, PageHeader } from '../components/ui';
import Icon from '../components/Icon';
import { fmtDateTime } from '../utils';

export default function Inventory() {
  const { user } = useAuth();
  const { state } = useStore();
  const canManage = can(user.role, 'inventory.manage');
  const [restock, setRestock] = useState(null);
  const [adding, setAdding] = useState(false);
  const material = (id) => state.materials.find((m) => m.id === id);
  const lowCount = state.materials.filter((m) => m.stock <= m.reorderLevel).length;

  return (
    <>
      <PageHeader title="Raw Materials" subtitle="Stock used by the factory to decide whether orders can be accepted.">
        {canManage && (
          <button className="btn primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={16} /> Add raw material
          </button>
        )}
      </PageHeader>

      <Card title="Stock levels" icon="box" actions={lowCount > 0 && <span className="badge tone-red">{lowCount} low</span>}>
        <div className="table-wrap">
          <table className="table stock-table">
            <thead>
              <tr>
                <th scope="col">Material</th>
                <th scope="col">Stock level</th>
                <th scope="col" className="num">
                  Reorder at
                </th>
                <th scope="col">Status</th>
                {canManage && (
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {state.materials.map((m) => {
                const low = m.stock <= m.reorderLevel;
                const pct = Math.min(100, (m.stock / Math.max(1, m.reorderLevel * 3)) * 100);
                return (
                  <tr key={m.id} className={low ? 'row-low' : ''}>
                    <td data-label="Material">
                      <strong>{m.name}</strong>
                      <div className="muted small">{m.id}</div>
                    </td>
                    <td data-label="Stock level">
                      <div className="stock">
                        <span className="nowrap">
                          <strong>{m.stock}</strong> {m.unit}
                        </span>
                        <div className="stock-bar" role="presentation">
                          <div className={`stock-fill ${low ? 'low' : ''}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </td>
                    <td data-label="Reorder at" className="num">
                      {m.reorderLevel} {m.unit}
                    </td>
                    <td data-label="Status">
                      <span className={`badge tone-${low ? 'red' : 'green'}`}>
                        <span className="badge-dot" aria-hidden="true" />
                        {low ? 'Low stock' : 'OK'}
                      </span>
                    </td>
                    {canManage && (
                      <td>
                        <button className="btn small" onClick={() => setRestock(m)} aria-label={`Receive stock for ${m.name}`}>
                          <Icon name="plus" size={14} /> Receive stock
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Bill of materials (per unit)" icon="layers">
          {state.products.map((p) => (
            <div key={p.id} className="bom">
              <strong>
                {p.id} · {p.name}
              </strong>
              <ul>
                {Object.entries(p.bom).map(([rmId, q]) => (
                  <li key={rmId}>
                    {material(rmId)?.name ?? rmId}: {q} {material(rmId)?.unit}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>

        <Card title="Stock movements" icon="clock">
          {state.inventoryLog.length === 0 ? (
            <p className="muted">No movements yet. Accepting an order or receiving stock records an entry here.</p>
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
                  {state.inventoryLog.slice(0, 25).map((l) => (
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
      </div>

      {restock && <RestockModal material={restock} onClose={() => setRestock(null)} />}
      {adding && <AddMaterialModal onClose={() => setAdding(false)} />}
    </>
  );
}

function RestockModal({ material, onClose }) {
  const { act } = useStore();
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const valid = Number(qty) > 0;
  return (
    <Modal title={`Receive stock · ${material.name}`} onClose={onClose}>
      <p className="muted small">
        Current stock: {material.stock} {material.unit}
      </p>
      <label>
        Quantity received ({material.unit})
        <input type="number" min="0" autoFocus value={qty} onChange={(e) => setQty(e.target.value)} />
      </label>
      <label>
        Supplier / GRN reference
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. GRN-1182 from Jindal Steel" />
      </label>
      <div className="btn-row">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={!valid}
          onClick={() => {
            act('RESTOCK', { rmId: material.id, qty: Number(qty), note: note.trim() || 'Stock received' });
            onClose();
          }}
        >
          Add to stock
        </button>
      </div>
    </Modal>
  );
}

function AddMaterialModal({ onClose }) {
  const { act } = useStore();
  const [m, setM] = useState({ name: '', unit: 'kg', stock: '', reorderLevel: '' });
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
          Opening stock
          <input type="number" min="0" value={m.stock} onChange={(e) => set('stock', e.target.value)} />
        </label>
        <label>
          Reorder level
          <input type="number" min="0" value={m.reorderLevel} onChange={(e) => set('reorderLevel', e.target.value)} />
        </label>
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
