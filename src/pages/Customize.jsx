import { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { CORE_MODULES, FEATURES, featureOn } from '../auth/features';
import { CUSTOMER_STEP, DEFAULT_NAMES, QC_STEP, STEP_KINDS, journeyOf, ordersAt } from '../data/statuses';
import { Card, Modal, PageHeader } from '../components/ui';
import { FIELD_TYPES } from '../components/ExtraFields';
import Icon from '../components/Icon';
import { useLang } from '../i18n';
import { DEFAULT_REASONS, REASON_GROUPS, reasonIcon } from '../data/reasons';
import { DISPATCH_MODES, QC_CHECKS } from '../data/seed';

const TABS = [
  { key: 'stages', label: 'Stages' },
  { key: 'modules', label: 'Modules' },
  { key: 'fields', label: 'Work order fields' },
  { key: 'lists', label: 'Lists' },
];

/** Administrator: production stages, which modules the company uses, extra order fields and the pick-lists people choose from. */
export default function Customize() {
  const [tab, setTab] = useState('stages');
  return (
    <>
      <PageHeader title="Customize" subtitle="Shape the app to how your factory works. Changes apply to every role straight away." />
      <div className="work-tabs" role="tablist" aria-label="Customize sections">
        {TABS.map((x) => (
          <button key={x.key} role="tab" aria-selected={tab === x.key} className={`work-tab ${tab === x.key ? 'active' : ''}`} onClick={() => setTab(x.key)}>
            {x.label}
          </button>
        ))}
      </div>
      {tab === 'stages' && <Stages />}
      {tab === 'modules' && <Modules />}
      {tab === 'fields' && <Fields />}
      {tab === 'lists' && <Lists />}
    </>
  );
}

/* ---------------------------------------------------------------- stages */

// Steps at the two ends that every work order needs; they can be renamed, and "Delivered" can be left out.
const START = { key: 'PENDING_REVIEW', why: 'Every work order starts here' };
const END = [
  { key: 'CLIENT_APPROVED', why: 'Needed to dispatch: orders wait here for a vehicle', approvable: true },
  { key: 'DISPATCHED', why: 'Needed to record the vehicle / courier and tracking ID' },
  { key: 'DELIVERED', step: 'delivery', help: 'Someone confirms the goods arrived. When left out, an order is complete once dispatched.' },
];
const KIND_HELP = {
  work: 'Someone marks it done and the order moves on.',
  qc: 'QC inspects. Pass moves on; fail sends the order back to production.',
  customer: 'The customer approves. A concern sends the order back to production.',
};

function Stages() {
  const { state, act } = useStore();
  const { t } = useLang();
  const approvals = featureOn('stageApprovals');
  // What each step is called right now (the admin's name, or the built-in one in the current language).
  const current = (key) => t(`flow.${key}`);

  const fromSaved = () => {
    const wf = state.settings.workflow;
    return {
      journey: journeyOf(wf).map((s) => ({ key: s.key, kind: s.kind, name: current(s.key), approve: state.settings.approvalStages.includes(s.key) })),
      names: Object.fromEntries([START, ...END].map((r) => [r.key, current(r.key)])),
      steps: { review: featureOn('review'), delivery: featureOn('delivery') },
      readyApproval: state.settings.approvalStages.includes('CLIENT_APPROVED'),
    };
  };
  const [draft, setDraft] = useState(fromSaved);
  const changed = JSON.stringify(draft) !== JSON.stringify(fromSaved());
  const atStatus = (key) => ordersAt(state.orders, key);

  const names = draft.journey.map((s) => s.name.trim().toLowerCase());
  const has = (kind) => draft.journey.some((s) => s.kind === kind);
  const problems = [
    ...(!has('work') ? ['Keep at least one work step.'] : []),
    ...(names.some((n) => !n) || Object.values(draft.names).some((n) => !n.trim()) ? ['Every step needs a name.'] : []),
    ...(new Set(names).size !== names.length ? ['Two steps have the same name.'] : []),
  ];

  const edit = (i, patch) => setDraft((d) => ({ ...d, journey: d.journey.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const move = (i, by) =>
    setDraft((d) => {
      const journey = [...d.journey];
      [journey[i], journey[i + by]] = [journey[i + by], journey[i]];
      return { ...d, journey };
    });
  const add = (kind) =>
    setDraft((d) => ({
      ...d,
      journey: [...d.journey, { kind, name: kind === 'work' ? '' : STEP_KINDS[kind].label, approve: false, key: kind === 'qc' ? QC_STEP : kind === 'customer' ? CUSTOMER_STEP : undefined }],
    }));
  const setName = (key, name) => setDraft((d) => ({ ...d, names: { ...d.names, [key]: name } }));

  const preview = [
    { label: draft.names.PENDING_REVIEW, fixed: true },
    ...draft.journey.map((s) => ({ label: s.name || '…' })),
    ...END.filter((r) => !r.step || draft.steps[r.step]).map((r) => ({ label: draft.names[r.key], fixed: true })),
  ];

  // A name nobody touched keeps what is saved (so built-in names stay translated); a typed one is used as is.
  const savedJourney = journeyOf(state.settings.workflow);
  const keepOrTyped = (s) =>
    s.key && s.name.trim() === current(s.key) ? (savedJourney.find((x) => x.key === s.key)?.name ?? DEFAULT_NAMES[s.key] ?? s.name.trim()) : s.name.trim();
  const save = () =>
    act('SET_STAGES', {
      journey: draft.journey.map((s) => ({ ...s, name: keepOrTyped(s) })),
      names: Object.fromEntries(
        Object.entries(draft.names).map(([k, n]) => [k, n.trim() === current(k) ? state.settings.workflow.names?.[k] ?? '' : n.trim()]).filter(([, n]) => n),
      ),
      steps: draft.steps,
      fixedApprovals: draft.readyApproval ? ['CLIENT_APPROVED'] : [],
    });

  const endRow = (row) => {
    const on = !row.step || draft.steps[row.step];
    return (
      <li key={row.key} className={`stage-row fixed-row ${on ? '' : 'left-out'}`}>
        <span className="stage-no">
          <Icon name="lock" size={12} />
        </span>
        <input value={draft.names[row.key]} aria-label={`Name for ${DEFAULT_NAMES[row.key]}`} disabled={!on} onChange={(e) => setName(row.key, e.target.value)} />
        <span className="stage-tools">
          {approvals && row.approvable && (
            <label className="stage-approve">
              <input type="checkbox" checked={draft.readyApproval} onChange={(e) => setDraft((d) => ({ ...d, readyApproval: e.target.checked }))} /> Sign-off
            </label>
          )}
          {row.step && (
            <label className="switch-label">
              <span className="small">Included</span>
              <span className="switch">
                <input
                  type="checkbox"
                  role="switch"
                  checked={on}
                  aria-label={`Include ${draft.names[row.key]}`}
                  onChange={(e) => setDraft((d) => ({ ...d, steps: { ...d.steps, [row.step]: e.target.checked } }))}
                />
                <span aria-hidden="true" />
              </span>
            </label>
          )}
        </span>
        <span className="stage-busy muted small">{row.why ?? (on ? row.help : 'Left out – orders are complete once dispatched.')}</span>
      </li>
    );
  };

  return (
    <Card title="Order journey" icon="layers">
      <p className="muted small">
        Every step a work order goes through, top to bottom. Rename any step, move steps up or down, remove the ones you do not use and add your own – work
        steps (cutting, welding, painting…), a quality check and a customer approval can go anywhere in between.
        {approvals ? ' Tick "Sign-off" where a stage approver must approve before the order moves on.' : ''}
      </p>
      <ol className="flow-preview" aria-label="Work order journey">
        {preview.map((p, i) => (
          <li key={i} className={p.fixed ? 'fixed' : ''}>
            {p.label}
          </li>
        ))}
      </ol>

      <ol className="stage-list">
        <li className="stage-row fixed-row">
          <span className="stage-no">
            <Icon name="lock" size={12} />
          </span>
          <input value={draft.names.PENDING_REVIEW} aria-label="Name for the first step" onChange={(e) => setName('PENDING_REVIEW', e.target.value)} />
          <span className="stage-tools">
            <label className="switch-label">
              <span className="small">Factory review</span>
              <span className="switch">
                <input
                  type="checkbox"
                  role="switch"
                  checked={draft.steps.review}
                  aria-label="Factory review"
                  onChange={(e) => setDraft((d) => ({ ...d, steps: { ...d.steps, review: e.target.checked } }))}
                />
                <span aria-hidden="true" />
              </span>
            </label>
          </span>
          <span className="stage-busy muted small">
            {START.why}.{' '}
            {draft.steps.review
              ? 'The factory checks raw material and accepts or holds each order.'
              : 'Orders whose raw material is in stock are accepted automatically; orders that are short still wait for the factory.'}
          </span>
        </li>

        {draft.journey.map((s, i) => {
          const busy = s.key ? atStatus(s.key) : 0;
          const saved = journeyOf(state.settings.workflow).some((x) => x.key === s.key);
          return (
            <li key={s.key || `new-${i}`} className={`stage-row kind-${s.kind}`}>
              <span className="stage-no">{i + 1}</span>
              <span className="stage-name">
                <input value={s.name} aria-label={`Step ${i + 1} name`} placeholder="Step name, e.g. Welding" onChange={(e) => edit(i, { name: e.target.value })} />
                <span className={`badge tone-${s.kind === 'work' ? 'blue' : s.kind === 'qc' ? 'cyan' : 'teal'}`}>{STEP_KINDS[s.kind].label}</span>
              </span>
              <span className="stage-tools">
                {approvals && (
                  <label className="stage-approve" title="The order waits here until a stage approver signs off">
                    <input type="checkbox" checked={s.approve} onChange={(e) => edit(i, { approve: e.target.checked })} /> Sign-off
                  </label>
                )}
                <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${s.name} up`}>
                  ↑
                </button>
                <button type="button" className="icon-btn" disabled={i === draft.journey.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${s.name} down`}>
                  ↓
                </button>
                <button
                  type="button"
                  className="icon-btn danger"
                  disabled={busy > 0 && saved}
                  title={busy && saved ? `${busy} work order${busy === 1 ? ' is' : 's are'} at this step – move them on first` : 'Remove step'}
                  onClick={() => setDraft((d) => ({ ...d, journey: d.journey.filter((_, j) => j !== i) }))}
                  aria-label={`Remove ${s.name}`}
                >
                  <Icon name="x" size={16} />
                </button>
              </span>
              <span className="stage-busy muted small">
                {KIND_HELP[s.kind]}
                {busy > 0 && saved ? ` · ${busy} here now` : ''}
              </span>
            </li>
          );
        })}

        {END.map(endRow)}
      </ol>

      <div className="btn-row tight">
        <button type="button" className="btn small" onClick={() => add('work')}>
          <Icon name="plus" size={14} /> Work step
        </button>
        <button type="button" className="btn small" disabled={has('qc')} title={has('qc') ? 'The journey already has a quality check' : ''} onClick={() => add('qc')}>
          <Icon name="plus" size={14} /> Quality check
        </button>
        <button
          type="button"
          className="btn small"
          disabled={has('customer')}
          title={has('customer') ? 'The journey already has a customer approval' : ''}
          onClick={() => add('customer')}
        >
          <Icon name="plus" size={14} /> Customer approval
        </button>
      </div>
      <p className="muted small">New steps are added at the end – use ↑ to move them where they belong.</p>

      {problems.length > 0 && <p className="field-error">{problems.join(' ')}</p>}
      <div className="btn-row">
        <button className="btn primary" disabled={!changed || problems.length > 0} onClick={save}>
          Save journey
        </button>
        <button className="btn ghost" disabled={!changed} onClick={() => setDraft(fromSaved())}>
          Discard changes
        </button>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- modules */

function Modules() {
  const { act } = useStore();
  return (
    <div className="stack">
      <Card title="Modules" icon="sliders">
        <p className="muted small">Switch off what your company does not use. Its menu items, pages and buttons disappear for everyone; the data stays and comes back when you switch it on.</p>
        <ul className="module-list">
          {/* Steps of the order journey (QC, customer approval…) are switched on the Stages tab. */}
          {FEATURES.filter((f) => !f.stage).map((f) => {
            const on = featureOn(f.key);
            return (
              <li key={f.key} className={`module-row ${on ? 'on' : ''}`}>
                <div>
                  <strong>{f.label}</strong>
                  <div className="muted small">{f.desc}</div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={on}
                    aria-label={f.label}
                    onChange={(e) => act('SET_FEATURE', { key: f.key, on: e.target.checked })}
                  />
                  <span aria-hidden="true" />
                </label>
              </li>
            );
          })}
        </ul>
      </Card>
      <Card title="Always on" icon="lock">
        <p className="muted small">The rest of the app is built on these, so they cannot be switched off. Rename them on Roles &amp; Access.</p>
        <p>{CORE_MODULES.join(' · ')}</p>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- work order fields */

function Fields() {
  const { state, act } = useStore();
  const fields = state.settings.orderFields ?? [];
  const [editing, setEditing] = useState(null); // field, or {} for a new one
  const save = (next) => act('SET_ORDER_FIELDS', { fields: next });
  const move = (i, by) => {
    const next = [...fields];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    save(next);
  };

  return (
    <Card
      title="Extra work order fields"
      icon="file"
      actions={
        <button className="btn small primary" onClick={() => setEditing({})}>
          <Icon name="plus" size={14} /> Add field
        </button>
      }
    >
      <p className="muted small">
        Fields you add appear on the New Work Order form, the work order page and the job card – for example drawing number, colour or
        inspection standard. Removing a field keeps what was already entered on older work orders.
      </p>
      {fields.length === 0 ? (
        <p className="muted">No extra fields yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Type</th>
                <th>Required</th>
                <th className="sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f, i) => (
                <tr key={f.id}>
                  <td data-label="Field">
                    <strong>{f.label}</strong>
                    {f.type === 'select' && <div className="muted small">{f.options.join(', ')}</div>}
                  </td>
                  <td data-label="Type">{FIELD_TYPES.find((x) => x.key === f.type)?.label}</td>
                  <td data-label="Required">{f.required ? 'Yes' : 'No'}</td>
                  <td className="row-actions">
                    <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${f.label} up`}>
                      ↑
                    </button>
                    <button className="icon-btn" disabled={i === fields.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${f.label} down`}>
                      ↓
                    </button>
                    <button className="btn small" onClick={() => setEditing(f)}>
                      Edit
                    </button>
                    <button className="btn small danger" onClick={() => save(fields.filter((x) => x.id !== f.id))}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <FieldDialog
          field={editing}
          taken={fields.filter((x) => x.id !== editing.id).map((x) => x.label.toLowerCase())}
          onClose={() => setEditing(null)}
          onSave={(f) => {
            save(editing.id ? fields.map((x) => (x.id === f.id ? f : x)) : [...fields, f]);
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

function FieldDialog({ field, taken, onClose, onSave }) {
  const [label, setLabel] = useState(field.label ?? '');
  const [type, setType] = useState(field.type ?? 'text');
  const [options, setOptions] = useState((field.options ?? []).join(', '));
  const [required, setRequired] = useState(Boolean(field.required));
  const list = options.split(',').map((o) => o.trim()).filter(Boolean);
  const error = !label.trim()
    ? 'Give the field a name.'
    : taken.includes(label.trim().toLowerCase())
      ? 'There is already a field with this name.'
      : type === 'select' && list.length < 2
        ? 'Enter at least two choices, separated by commas.'
        : null;

  const submit = (e) => {
    e.preventDefault();
    if (error) return;
    onSave({ id: field.id ?? `F${Date.now().toString(36)}`, label: label.trim(), type, options: type === 'select' ? list : [], required });
  };

  return (
    <Modal title={field.id ? 'Edit field' : 'Add field'} onClose={onClose}>
      <form onSubmit={submit} className="form-grid">
        <label className="span-2">
          Field name
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Drawing no." autoFocus />
        </label>
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {FIELD_TYPES.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="check-inline">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Required
        </label>
        {type === 'select' && (
          <label className="span-2">
            Choices
            <input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Red, Blue, Grey" />
            <small className="hint">Separate with commas.</small>
          </label>
        )}
        {error && <p className="field-error span-2">{error}</p>}
        <div className="btn-row span-2">
          <button type="submit" className="btn primary" disabled={Boolean(error)}>
            Save field
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------------------------------------------------------------- lists */

const VEHICLE_LISTS = { own: 'Own vehicles', courier: 'Courier services', transporter: 'Transport partners' };

/** The pick-lists people tap from: reasons, the QC checklist, and vehicles / couriers / transporters. */
function Lists() {
  const { state, act } = useStore();
  const { t } = useLang();
  const lists = state.settings.lists;
  const save = (patch) => act('SET_LISTS', { lists: patch });
  // "Other" always stays last in a list.
  const otherLast = (codes) => [...codes.filter((c) => c !== 'other'), ...(codes.includes('other') ? ['other'] : [])];

  // Reasons: built-in ones can be switched off per list; the admin's own can be added to any list.
  const toggleReason = (group, code) => {
    const now = lists.reasons[group];
    save({ reasons: { ...lists.reasons, [group]: otherLast(now.includes(code) ? now.filter((c) => c !== code) : [...now, code]) } });
  };
  const addReason = (group, label) => {
    const existing = Object.entries(lists.customReasons).find(([, l]) => l.toLowerCase() === label.toLowerCase())?.[0];
    const code = existing ?? `c_${Date.now().toString(36)}`;
    if (lists.reasons[group].includes(code)) return;
    save({
      customReasons: { ...lists.customReasons, [code]: label },
      retiredReasons: retired.filter((c) => c !== code),
      reasons: { ...lists.reasons, [group]: otherLast([...lists.reasons[group], code]) },
    });
  };
  // A deleted reason keeps its name (older work orders still show it) but leaves every list.
  const deleteCustom = (code) =>
    save({
      retiredReasons: [...retired, code],
      reasons: Object.fromEntries(Object.entries(lists.reasons).map(([g, codes]) => [g, codes.filter((c) => c !== code)])),
    });
  const retired = lists.retiredReasons ?? [];
  const yours = Object.entries(lists.customReasons).filter(([code]) => !retired.includes(code));

  return (
    <div className="stack">
      <Card title="Reasons" icon="alert">
        <p className="muted small">
          The reasons people tap instead of typing. Tap a built-in reason to switch it off or on for that list, or add your own.
          &quot;Other&quot; is always there so nobody gets stuck.
        </p>
        {Object.entries(REASON_GROUPS).map(([group, title]) => {
          const custom = lists.reasons[group].filter((c) => lists.customReasons[c]);
          return (
            <section key={group} className="list-group">
              <h3>{title}</h3>
              <div className="tag-row">
                {DEFAULT_REASONS[group]
                  .filter((c) => c !== 'other')
                  .map((c) => {
                    const on = lists.reasons[group].includes(c);
                    return (
                      <button key={c} type="button" className={`tag ${on ? 'on' : 'off'}`} aria-pressed={on} onClick={() => toggleReason(group, c)}>
                        {reasonIcon(c)} {t(`reason.${c}`)}
                      </button>
                    );
                  })}
                {custom.map((c) => (
                  <span key={c} className="tag on">
                    {reasonIcon(c)} {lists.customReasons[c]}
                    <button type="button" className="tag-x" aria-label={`Remove ${lists.customReasons[c]} from this list`} onClick={() => toggleReason(group, c)}>
                      ×
                    </button>
                  </span>
                ))}
                <span className="tag fixed">
                  {reasonIcon('other')} {t('reason.other')}
                </span>
              </div>
              <AddItem placeholder="New reason, e.g. Paint shop full" onAdd={(label) => addReason(group, label)} />
            </section>
          );
        })}
        {yours.length > 0 && (
          <section className="list-group">
            <h3>Your reasons</h3>
            <p className="muted small">Deleting one here removes it from every list. Work orders that already used it keep the name.</p>
            <div className="tag-row">
              {yours.map(([code, label]) => (
                <span key={code} className="tag on">
                  {label}
                  <button type="button" className="tag-x" aria-label={`Delete ${label} everywhere`} title="Delete everywhere" onClick={() => deleteCustom(code)}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          </section>
        )}
      </Card>

      <Card title="QC checklist" icon="shield">
        <p className="muted small">What the QC inspector ticks before passing a work order. Reports already made keep the checklist they used.</p>
        <EditableList
          items={lists.qcChecks}
          labelOf={(c) => (QC_CHECKS.includes(c) ? t(`qc.check.${QC_CHECKS.indexOf(c)}`) : c)}
          min={1}
          placeholder="New check, e.g. Welding seams inspected"
          onChange={(qcChecks) => save({ qcChecks })}
        />
      </Card>

      <Card title="Vehicles & carriers" icon="truck">
        <p className="muted small">The choices shown when a work order is dispatched.</p>
        {Object.entries(VEHICLE_LISTS).map(([mode, title]) => (
          <section key={mode} className="list-group">
            <h3>
              {title} <span className="muted small">· {DISPATCH_MODES[mode]}</span>
            </h3>
            <EditableList
              items={lists.vehicles[mode]}
              placeholder={mode === 'own' ? 'e.g. TN-09-XY-1234 · Tata Ace (1T)' : 'Company name'}
              onChange={(items) => save({ vehicles: { ...lists.vehicles, [mode]: items } })}
            />
          </section>
        ))}
      </Card>
    </div>
  );
}

/** Tags with a remove button, plus an input to add one more. */
function EditableList({ items, onChange, placeholder, labelOf = (x) => x, min = 0 }) {
  return (
    <>
      <div className="tag-row">
        {items.length === 0 && <span className="muted small">Nothing yet.</span>}
        {items.map((x) => (
          <span key={x} className="tag on">
            {labelOf(x)}
            <button
              type="button"
              className="tag-x"
              disabled={items.length <= min}
              title={items.length <= min ? 'Keep at least one' : 'Remove'}
              aria-label={`Remove ${labelOf(x)}`}
              onClick={() => onChange(items.filter((y) => y !== x))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <AddItem placeholder={placeholder} onAdd={(v) => !items.some((y) => y.toLowerCase() === v.toLowerCase()) && onChange([...items, v])} />
    </>
  );
}

function AddItem({ placeholder, onAdd }) {
  const [value, setValue] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    onAdd(value.trim());
    setValue('');
  };
  return (
    <form className="add-item" onSubmit={submit}>
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      <button type="submit" className="btn small" disabled={!value.trim()}>
        <Icon name="plus" size={14} /> Add
      </button>
    </form>
  );
}
