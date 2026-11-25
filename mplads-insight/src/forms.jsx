import React, { useState, useEffect, useRef } from "react";
import {
  Download,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  ShieldAlert,
  MapPin,
  CalendarDays,
  Building2,
  IndianRupee,
  Plus,
  Activity,
  Clock3,
  MessageSquare,
  LockKeyhole,
  RefreshCw,
  X,
  Info,
} from "lucide-react";
import { api, money, date, roleNames, sectors } from "./api";
import {
  Spinner,
  Empty,
  Badge,
  Risk,
  Modal,
  Field,
  ErrorBox,
  Icon,
} from "./components";

const today = () => new Date().toLocaleDateString("en-CA");
function FormActions({ onClose, busy, label = "Save changes" }) {
  return (
    <div className="form-actions">
      <button type="button" className="btn secondary" onClick={onClose}>
        Cancel
      </button>
      <button className="btn primary" disabled={busy}>
        {busy ? (
          <>
            <RefreshCw size={16} className="spin" />
            Saving…
          </>
        ) : (
          label
        )}
      </button>
    </div>
  );
}
export function NewProject({ user, onClose, onSaved }) {
  const [error, setError] = useState(null),
    [busy, setBusy] = useState(false);
  const now = new Date(),
    y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const values = Object.fromEntries(new FormData(e.target));
    for (const f of ["sanctioned", "expenditure", "progress"])
      values[f] = Number(values[f]);
    if (!values.estimated_cost) delete values.estimated_cost;
    try {
      const r = await api("/projects", { method: "POST", body: values });
      onSaved("Project " + r.id + " created and analyzed.");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Add a project"
      subtitle="Start tracking a sanctioned work and its progress."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="modal-body">
        <ErrorBox error={error} />
        <div className="form-section-label">PROJECT DETAILS</div>
        <Field label="Project name">
          <input
            required
            minLength={5}
            maxLength={180}
            name="name"
            placeholder="e.g. Government school classroom extension"
          />
        </Field>
        <div className="form-grid">
          <Field label="Sector">
            <select name="sector">
              {sectors.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Implementing agency">
            <input
              required
              minLength={2}
              maxLength={160}
              name="agency"
              placeholder="Agency or department"
            />
          </Field>
          <Field label="State">
            <input
              required
              minLength={2}
              name="state"
              defaultValue={user.role === "state" ? user.scope : ""}
              readOnly={user.role === "state"}
              placeholder="e.g. Uttar Pradesh"
            />
          </Field>
          <Field label="District">
            <input
              required
              minLength={2}
              name="district"
              defaultValue={user.role === "district" ? user.scope : ""}
              readOnly={user.role === "district"}
              placeholder="e.g. Varanasi"
            />
          </Field>
          <Field label="Constituency">
            <input
              required
              minLength={2}
              name="constituency"
              placeholder="Parliamentary constituency"
            />
          </Field>
          <Field label="Work location">
            <input
              required
              minLength={2}
              name="location"
              placeholder="Ward, village or address"
            />
          </Field>
        </div>
        <div className="form-section-label">FUNDS & TIMELINE</div>
        <div className="form-grid">
          <Field label="Original cost estimate (₹, optional)">
            <input
              type="number"
              name="estimated_cost"
              min=".01"
              max="100000000000"
              step=".01"
            />
          </Field>
          <Field label="Sanctioned amount (₹)">
            <input
              required
              type="number"
              name="sanctioned"
              min=".01"
              max="100000000000"
              step=".01"
              placeholder="3500000"
            />
          </Field>
          <Field
            label="Opening expenditure (₹)"
            hint="Opening balance; add future payments individually."
          >
            <input
              required
              type="number"
              name="expenditure"
              min="0"
              max="100000000000"
              step=".01"
              defaultValue="0"
            />
          </Field>
          <Field label="Physical progress (%)">
            <input
              required
              type="number"
              name="progress"
              min="0"
              max="100"
              step=".1"
              defaultValue="0"
            />
          </Field>
          <Field label="Financial year">
            <input
              required
              name="fiscal_year"
              pattern="20[0-9]{2}-[0-9]{2}"
              defaultValue={y + "-" + String(y + 1).slice(-2)}
            />
          </Field>
          <Field label="Start date">
            <input
              required
              type="date"
              name="start_date"
              max={today()}
              defaultValue={today()}
            />
          </Field>
          <Field label="Planned completion">
            <input required type="date" name="due_date" />
          </Field>
        </div>
        <FormActions onClose={onClose} busy={busy} label="Create project" />
      </form>
    </Modal>
  );
}
export function ImportDialog({ onClose, onSaved }) {
  const [file, setFile] = useState(null),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false),
    [drag, setDrag] = useState(false),
    [preview, setPreview] = useState("");
  const input = useRef();
  async function choose(f) {
    setError(null);
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".csv")) {
      setError(new Error("Choose a .csv file."));
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError(new Error("The file must be smaller than 5 MB."));
      return;
    }
    setFile(f);
    setPreview((await f.text()).split(/\r?\n/).slice(0, 4).join("\n"));
  }
  async function submit(e) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    const data = new FormData();
    data.append("file", file);
    try {
      const r = await api("/import", { method: "POST", body: data });
      onSaved(r.message);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Import project data"
      subtitle="Validate your CSV, save your records, and generate risk signals."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="modal-body">
        <div className="import-template">
          <FileSpreadsheet size={23} />
          <div>
            <strong>Use the project template</strong>
            <p>Includes all required columns and an example record.</p>
          </div>
          <a href="/api/import/template" className="btn secondary small">
            <Download size={15} />
            Template
          </a>
        </div>
        <ErrorBox error={error} />
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          aria-label="Choose CSV file"
          className="visually-hidden"
          onChange={(e) => choose(e.target.files[0])}
        />
        <button
          type="button"
          className={"dropzone " + (drag ? "drag" : "")}
          onClick={() => input.current.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            choose(e.dataTransfer.files[0]);
          }}
        >
          <span>
            <UploadCloud size={30} />
          </span>
          <strong>
            {file ? file.name : "Drop your CSV here, or click to browse"}
          </strong>
          <small>
            {file
              ? (file.size / 1024).toFixed(1) +
                " KB · Click to choose another file"
              : "UTF-8 CSV · Maximum 5 MB · Up to 1,000 projects"}
          </small>
        </button>
        {preview && (
          <div className="import-preview">
            <strong>File preview</strong>
            <pre>{preview}</pre>
          </div>
        )}
        <div className="info-banner">
          <Info size={17} />
          <span>
            All rows are validated before saving. If any row fails, nothing is
            imported. Existing project duplicates are rejected.
          </span>
        </div>
        <div className="form-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!file || busy}>
            <UploadCloud size={16} />
            {busy ? "Validating & analyzing…" : "Import & analyze"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function ProjectDrawer({ id, user, onClose, onSaved, onReview }) {
  const [project, setProject] = useState(null),
    [error, setError] = useState(null),
    [tick, setTick] = useState(0),
    [tab, setTab] = useState("Overview"),
    [form, setForm] = useState(""),
    [busy, setBusy] = useState(false),
    [saveError, setSaveError] = useState(null);
  useEffect(() => {
    let active = true;
    api("/projects/" + id)
      .then((p) => active && setProject(p))
      .catch((e) => active && setError(e));
    return () => {
      active = false;
    };
  }, [id, tick]);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setSaveError(null);
    const d = Object.fromEntries(new FormData(e.target));
    if (form === "progress") d.progress = Number(d.progress);
    else if (form === "payment") d.amount = Number(d.amount);
    try {
      await api(
        "/projects/" +
          id +
          (form === "progress"
            ? "/progress"
            : form === "asset"
              ? "/asset"
              : "/payments"),
        { method: form === "progress" ? "PATCH" : "POST", body: d },
      );
      setForm("");
      setTick((t) => t + 1);
      onSaved(
        form === "progress"
          ? "Progress updated and risk recalculated."
          : form === "asset"
            ? "Asset handover registered."
            : "Payment recorded and risk recalculated.",
      );
    } catch (e) {
      setSaveError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Project details" subtitle={id} onClose={onClose} drawer>
      <ErrorBox error={error} />
      {!project ? (
        <Spinner />
      ) : (
        <>
          <div className="project-detail-top">
            <span className="detail-sector">
              <Icon name={project.sector} size={24} />
            </span>
            <Badge>{project.status}</Badge>
            <h2>{project.name}</h2>
            <p>
              <MapPin size={15} />
              {project.location}, {project.state}
            </p>
            <div className="detail-risk">
              <Risk score={project.risk_score} level={project.risk_level} />
              <span>Review priority · not a fraud probability</span>
            </div>
          </div>
          <div className="detail-tabs">
            {["Overview", "Payments", "Asset", "Activity"].map((t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => {
                  setTab(t);
                  setForm("");
                }}
              >
                {t}
                {t === "Payments" && <span>{project.payments.length}</span>}
              </button>
            ))}
          </div>
          <div className="drawer-content">
            {tab === "Overview" && (
              <>
                <div className="detail-metrics">
                  <div>
                    <span>Sanctioned amount</span>
                    <strong>{money(project.sanctioned)}</strong>
                  </div>
                  <div>
                    <span>Expenditure</span>
                    <strong>{money(project.expenditure)}</strong>
                  </div>
                  <div>
                    <span>Physical progress</span>
                    <strong>{project.progress}%</strong>
                  </div>
                </div>
                <div className="detail-progress">
                  <div>
                    <span>Physical completion</span>
                    <strong>{project.progress}%</strong>
                  </div>
                  <div className="progress-track">
                    <i style={{ width: project.progress + "%" }} />
                  </div>
                </div>
                <h3 className="section-title">
                  Risk evidence <Badge>{project.risk_level}</Badge>
                </h3>
                {project.reasons.length ? (
                  <div className="evidence-list">
                    {project.reasons.map((r) => (
                      <div key={r.kind}>
                        <span className="evidence-icon">
                          <ShieldAlert size={17} />
                        </span>
                        <div>
                          <strong>{r.title}</strong>
                          <p>{r.detail}</p>
                        </div>
                        <b>+{r.points}</b>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="clean-signal">
                    <CheckCircle2 size={20} />
                    <div>
                      <strong>No elevated signals detected</strong>
                      <p>Continue routine oversight and source verification.</p>
                    </div>
                  </div>
                )}
                <dl className="project-facts">
                  {[
                    ["Implementing agency", project.agency],
                    ["Constituency", project.constituency],
                    ["Sector", project.sector],
                    ["Financial year", project.fiscal_year],
                    ["Start date", date(project.start_date)],
                    ["Planned completion", date(project.due_date)],
                    [
                      "Original estimate",
                      project.estimated_cost
                        ? money(project.estimated_cost)
                        : "Unrecorded",
                    ],
                    ["Data source", project.source],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
                {user.role !== "mp" && (
                  <div className="button-row">
                    <button
                      className="btn primary"
                      onClick={() => {
                        setForm(form === "progress" ? "" : "progress");
                        setSaveError(null);
                      }}
                    >
                      <Activity size={16} />
                      Update progress
                    </button>
                    {project.alert && (
                      <button
                        className="btn secondary"
                        onClick={() => onReview(project.alert)}
                      >
                        <ShieldAlert size={16} />
                        Review alert
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
            {tab === "Payments" && (
              <>
                <div className="section-title">
                  <h3>Payment ledger</h3>
                  {user.role !== "mp" && (
                    <button
                      className="btn primary small"
                      onClick={() => {
                        setForm(form === "payment" ? "" : "payment");
                        setSaveError(null);
                      }}
                    >
                      <Plus size={16} />
                      Add payment
                    </button>
                  )}
                </div>
                <div className="ledger-total">
                  <span>Total recorded expenditure</span>
                  <strong>{money(project.expenditure, false)}</strong>
                </div>
                {!project.payments.length ? (
                  <Empty
                    title="No payments recorded"
                    text="Add the first payment to this project's ledger."
                  />
                ) : (
                  <div className="payment-list">
                    {project.payments.map((p) => (
                      <div key={p.id}>
                        <span className="payment-icon">
                          <IndianRupee size={19} />
                        </span>
                        <div>
                          <strong>{p.reference}</strong>
                          <p>{p.payee}</p>
                          <small>
                            {date(p.paid_on)}
                            {p.note ? " · " + p.note : ""}
                          </small>
                        </div>
                        <b>{money(p.amount)}</b>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {tab === "Asset" && (
              <>
                <h3 className="section-title">Asset handover</h3>
                {project.asset ? (
                  <dl className="project-facts">
                    {[
                      ["Asset reference", project.asset.asset_ref],
                      ["Description", project.asset.description],
                      ["Custodian", project.asset.custodian],
                      ["Handed over", date(project.asset.handover_date)],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="muted">
                    {project.progress === 100
                      ? "No handover has been recorded for this completed work."
                      : "Asset registration becomes available at 100% physical completion."}
                  </p>
                )}
                {project.progress === 100 &&
                  !project.asset &&
                  user.role !== "mp" &&
                  !form && (
                    <button
                      className="btn primary"
                      onClick={() => setForm("asset")}
                    >
                      Register asset
                    </button>
                  )}
              </>
            )}
            {tab === "Activity" &&
              (!project.history.length ? (
                <Empty
                  title="No recorded changes"
                  text="Future payments, progress updates and review decisions appear here."
                />
              ) : (
                <div className="detail-history">
                  {project.history.map((h) => (
                    <div key={h.id}>
                      <Clock3 size={18} />
                      <div>
                        <strong>{h.action}</strong>
                        <p>{h.detail}</p>
                        <small>
                          {h.actor} · {date(h.created_at)}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            {form && (
              <form className="inline-form" onSubmit={submit}>
                <h3>
                  {form === "progress"
                    ? "Update physical progress"
                    : form === "asset"
                      ? "Register completed asset"
                      : "Record a payment"}
                </h3>
                <ErrorBox error={saveError} />
                {form === "asset" ? (
                  <>
                    <Field label="Asset reference">
                      <input
                        required
                        minLength={3}
                        maxLength={80}
                        name="asset_ref"
                      />
                    </Field>
                    <Field label="Asset description">
                      <input
                        required
                        minLength={5}
                        maxLength={200}
                        name="description"
                      />
                    </Field>
                    <Field label="Receiving custodian">
                      <input
                        required
                        minLength={2}
                        maxLength={160}
                        name="custodian"
                      />
                    </Field>
                    <Field label="Handover date">
                      <input
                        required
                        type="date"
                        name="handover_date"
                        min={project.start_date}
                        max={today()}
                        defaultValue={today()}
                      />
                    </Field>
                  </>
                ) : form === "progress" ? (
                  <React.Fragment>
                    <>
                      <Field label="Completion (%)">
                        <input
                          required
                          type="number"
                          min="0"
                          max="100"
                          step=".1"
                          name="progress"
                          defaultValue={project.progress}
                        />
                      </Field>
                      <Field label="Evidence or update note">
                        <textarea
                          required
                          name="note"
                          minLength={5}
                          maxLength={1000}
                          placeholder="Describe the verified work completed…"
                        />
                      </Field>
                    </>
                  </React.Fragment>
                ) : (
                  <>
                    <div className="form-grid">
                      <Field label="Payment reference">
                        <input
                          required
                          name="reference"
                          minLength={3}
                          maxLength={100}
                          placeholder="Unique invoice or transaction ID"
                        />
                      </Field>
                      <Field label="Amount (₹)">
                        <input
                          required
                          type="number"
                          min=".01"
                          max="10000000000"
                          step=".01"
                          name="amount"
                        />
                      </Field>
                      <Field label="Payment date">
                        <input
                          required
                          type="date"
                          name="paid_on"
                          max={today()}
                          min={project.start_date}
                          defaultValue={today()}
                        />
                      </Field>
                      <Field label="Payee">
                        <input
                          required
                          minLength={2}
                          name="payee"
                          defaultValue={project.agency}
                        />
                      </Field>
                    </div>
                    <Field label="Note (optional)">
                      <textarea name="note" maxLength={500} />
                    </Field>
                  </>
                )}
                <FormActions
                  onClose={() => setForm("")}
                  busy={busy}
                  label={
                    form === "progress"
                      ? "Save progress"
                      : form === "asset"
                        ? "Register asset"
                        : "Record payment"
                  }
                />
              </form>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
export function ReviewDialog({ alert, user, onClose, onSaved }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api("/alerts")
      .then((rows) => {
        if (active) {
          const a = rows.find((x) => x.id === alert.id);
          if (!a)
            setError(
              new Error(
                "This alert is no longer active. Refresh your workspace.",
              ),
            );
          else setData(a);
        }
      })
      .catch((e) => active && setError(e));
    return () => {
      active = false;
    };
  }, [alert.id]);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/alerts/" + alert.id + "/review", {
        method: "POST",
        body: Object.fromEntries(new FormData(e.target)),
      });
      onSaved("Review saved to the audit trail.");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Review risk alert"
      subtitle={alert.project_id}
      onClose={onClose}
      wide
    >
      <div className="modal-body">
        <ErrorBox error={error} />
        {!data ? (
          <Spinner />
        ) : (
          <>
            <div className="review-title">
              <Badge>{data.severity}</Badge>
              <Badge>{data.status}</Badge>
              <h3>{data.title}</h3>
              <p>{data.name}</p>
            </div>
            <div className="evidence-list">
              {data.reasons.map((r) => (
                <div key={r.kind}>
                  <ShieldAlert size={17} />
                  <div>
                    <strong>{r.title}</strong>
                    <p>{r.detail}</p>
                  </div>
                  <b>+{r.points}</b>
                </div>
              ))}
            </div>
            {user.role !== "mp" && (
              <form onSubmit={submit}>
                <Field label="Review status">
                  <select name="status" defaultValue={data.status}>
                    {["Open", "In review", "Resolved", "Dismissed"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Review note"
                  hint="Record the evidence checked and the reason for your decision."
                >
                  <textarea
                    required
                    minLength={10}
                    maxLength={2000}
                    name="note"
                    placeholder="e.g. Requested revised sanction and completion evidence from the implementing agency…"
                  />
                </Field>
                <FormActions
                  onClose={onClose}
                  busy={busy}
                  label="Save review"
                />
              </form>
            )}
            <h3 className="section-title">Review history</h3>
            {data.reviews.length ? (
              <div className="review-history">
                {data.reviews.map((r) => (
                  <div key={r.id}>
                    <div>
                      <strong>{r.author}</strong>
                      <Badge>{r.status}</Badge>
                    </div>
                    <p>{r.note}</p>
                    <small>{date(r.created_at)}</small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">
                No review has been recorded for this alert.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
export function NewUser({ onClose, onSaved }) {
  const [role, setRole] = useState("district"),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/users", {
        method: "POST",
        body: Object.fromEntries(new FormData(e.target)),
      });
      onSaved("Workspace member created.");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Add a workspace member"
      subtitle="Assign the access needed for their oversight responsibilities."
      onClose={onClose}
    >
      <form className="modal-body" onSubmit={submit}>
        <ErrorBox error={error} />
        <Field label="Full name">
          <input required minLength={2} maxLength={100} name="name" />
        </Field>
        <Field label="Email address">
          <input type="email" required name="email" />
        </Field>
        <Field
          label="Password"
          hint="At least 12 characters. Share credentials through a secure channel."
        >
          <input
            type="password"
            required
            minLength={12}
            maxLength={200}
            name="password"
            autoComplete="new-password"
          />
        </Field>
        <Field label="Role">
          <select
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {Object.entries(roleNames).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        {role !== "ministry" && (
          <Field
            label={
              role === "state"
                ? "State"
                : role === "district"
                  ? "District"
                  : "Constituency"
            }
            hint="Use the exact name in the project register."
          >
            <input name="scope" required maxLength={100} />
          </Field>
        )}
        <FormActions onClose={onClose} busy={busy} label="Create member" />
      </form>
    </Modal>
  );
}
