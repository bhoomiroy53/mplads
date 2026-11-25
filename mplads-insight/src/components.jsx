import React, { useEffect, useRef, useState } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Search,
  ArrowUpRight,
  Inbox,
  LoaderCircle,
  ShieldCheck,
  Building2,
  GraduationCap,
  Droplets,
  HeartPulse,
  Route,
  Trash2,
} from "lucide-react";
import { money } from "./api";
export function Icon({ name, ...props }) {
  const Map = {
    Education: GraduationCap,
    "Drinking water": Droplets,
    "Roads & bridges": Route,
    Healthcare: HeartPulse,
    "Community assets": Building2,
    Sanitation: Trash2,
  };
  const I = Map[name] || Building2;
  return <I {...props} />;
}
export function Spinner() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={24} />
      <span>Loading your workspace…</span>
    </div>
  );
}
export function Empty({
  title = "Nothing here yet",
  text = "Records will appear here when they are available.",
  action,
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Inbox size={30} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Badge({ children, type }) {
  const v = type || String(children).toLowerCase().replaceAll(" ", "-");
  return <span className={"badge " + v}>{children}</span>;
}
export function Risk({ score, level }) {
  return (
    <div className="risk-cell">
      <span className={"risk-number " + level?.toLowerCase()}>{score}</span>
      <div>
        <span>{level}</span>
        <span className="risk-line">
          <i style={{ width: score + "%" }} className={level?.toLowerCase()} />
        </span>
      </div>
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  drawer = false,
}) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const handler = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const list = ref.current?.querySelectorAll(
          'button:not(:disabled),input,select,textarea,a[href],[tabindex="0"]',
        );
        if (!list?.length) return;
        const first = list[0],
          last = list[list.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", handler);
      prev?.focus();
    };
  }, []);
  return (
    <div
      className={"modal-backdrop " + (drawer ? "drawer-backdrop" : "")}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={"modal " + (wide ? "wide " : "") + (drawer ? "drawer" : "")}
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function ErrorBox({ error }) {
  return error ? (
    <div className="error-box" role="alert">
      {error.message || error}
      {error.details && (
        <ul>
          {error.details.map((e) => (
            <li key={e.row}>
              Row {e.row}: {e.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  ) : null;
}
export function ProjectTable({ projects, onSelect, compact = false }) {
  const [page, setPage] = useState(1);
  const size = compact ? 5 : 10;
  useEffect(() => setPage(1), [projects]);
  if (!projects?.length)
    return (
      <Empty
        title="No matching projects"
        text="Try a different search or clear your filters."
      />
    );
  const pages = Math.ceil(projects.length / size),
    rows = projects.slice((page - 1) * size, page * size);
  return (
    <>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Project details</th>
              <th>Location</th>
              <th>Sanctioned</th>
              <th>Progress</th>
              <th>Risk score</th>
              <th aria-label="View project" />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} onClick={() => onSelect(p.id)}>
                <td>
                  <div className="project-cell">
                    <span className="sector-icon">
                      <Icon name={p.sector} size={19} />
                    </span>
                    <div>
                      <button
                        className="project-title"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(p.id);
                        }}
                      >
                        {p.name}
                      </button>
                      <small>
                        {p.id} <span>·</span> {p.sector}
                      </small>
                    </div>
                  </div>
                </td>
                <td>
                  <span>{p.district}</span>
                  <small>{p.state}</small>
                </td>
                <td className="amount">{money(p.sanctioned)}</td>
                <td>
                  <div className="progress-cell">
                    <span>{p.progress}%</span>
                    <div className="progress-track">
                      <i style={{ width: p.progress + "%" }} />
                    </div>
                  </div>
                </td>
                <td>
                  <Risk score={p.risk_score} level={p.risk_level} />
                </td>
                <td>
                  <button
                    className="icon-btn"
                    aria-label={"View " + p.name}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(p.id);
                    }}
                  >
                    <ArrowUpRight size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!compact && (
        <div className="pagination">
          <span>
            Showing {(page - 1) * size + 1}–
            {Math.min(page * size, projects.length)} of {projects.length}{" "}
            projects
          </span>
          <div>
            <button
              className="icon-btn"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft size={18} />
            </button>
            <span>
              Page {page} of {pages}
            </span>
            <button
              className="icon-btn"
              disabled={page === pages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Next page"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
