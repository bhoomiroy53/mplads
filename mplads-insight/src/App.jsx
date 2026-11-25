import React, { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  ShieldAlert,
  ChartNoAxesCombined,
  Database,
  FileBarChart2,
  BrainCircuit,
  Settings2,
  Search,
  Bell,
  ChevronDown,
  ChevronRight,
  Plus,
  Download,
  RefreshCw,
  Check,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  IndianRupee,
  Landmark,
  Activity,
  CheckCircle2,
  Clock3,
  UploadCloud,
  SlidersHorizontal,
  Info,
  ExternalLink,
  LockKeyhole,
  Mail,
  ArrowUpRight,
  Globe2,
  BookOpen,
  Users,
  FileSpreadsheet,
  History,
  CalendarDays,
  Sparkles,
  Building2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { api, setSession, money, date, roleNames, sectors, query } from "./api";
import {
  Spinner,
  Empty,
  Badge,
  Risk,
  Modal,
  Field,
  ErrorBox,
  ProjectTable,
  Icon,
} from "./components";
import {
  ProjectDrawer,
  NewProject,
  ImportDialog,
  ReviewDialog,
  NewUser,
} from "./forms";

const NAV = [
  ["overview", "Overview", LayoutDashboard],
  ["projects", "Projects", FolderKanban],
  ["alerts", "Risk & alerts", ShieldAlert],
  ["funds", "Fund analytics", ChartNoAxesCombined],
  ["data", "Data sources", Database],
  ["reports", "Reports", FileBarChart2],
  ["model", "Model insights", BrainCircuit],
];
const colors = [
  "#237557",
  "#86b79a",
  "#a4bacb",
  "#d9b779",
  "#9e99c1",
  "#ccd9d1",
];
function useData(path, tick = 0) {
  const [state, setState] = useState({
    data: null,
    loading: true,
    error: null,
  });
  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    api(path)
      .then((data) => active && setState({ data, loading: false, error: null }))
      .catch(
        (error) => active && setState({ data: null, loading: false, error }),
      );
    return () => {
      active = false;
    };
  }, [path, tick]);
  return state;
}
function Panel({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={"panel " + className}>
      <div className="panel-heading">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function TrendChart({ data }) {
  return (
    <div className="trend-chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 12, right: 14, left: -18, bottom: 0 }}
        >
          <defs>
            <linearGradient id="fundFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#318163" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#318163" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="#e9edea"
            strokeDasharray="3 4"
          />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "#7c8782" }}
            dy={10}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "#7c8782" }}
            tickFormatter={(n) => "₹" + n}
          />
          <Tooltip
            formatter={(v, n) => [
              "₹" + v + " Cr",
              n === "sanctioned" ? "Sanctioned" : "Expenditure",
            ]}
            contentStyle={{
              border: "1px solid #e5ebe7",
              borderRadius: 12,
              fontSize: 13,
            }}
          />
          <Area
            type="monotone"
            dataKey="sanctioned"
            stroke="#abb9af"
            strokeWidth={2}
            strokeDasharray="5 5"
            fill="transparent"
          />
          <Area
            type="monotone"
            dataKey="expenditure"
            stroke="#247856"
            strokeWidth={2.6}
            fill="url(#fundFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
function Metric({ label, value, sub, icon: Icon, tone = "green", bar }) {
  return (
    <div className="metric">
      <div className="metric-label">
        {label}
        <span className={"metric-icon " + tone}>
          <Icon size={17} />
        </span>
      </div>
      <strong>{value}</strong>
      <div className="metric-bottom">
        <span>{sub}</span>
        {bar != null ? (
          <div className="mini-progress">
            <i style={{ width: Math.min(bar, 100) + "%" }} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
function Overview({ data, projects, go, openProject, onRun, running, user }) {
  const riskData = [
    { name: "Low risk", value: data.low_risk },
    { name: "Medium risk", value: data.medium_risk },
    { name: "High risk", value: data.high_risk },
  ];
  return (
    <>
      <div className="insight-strip">
        <div className="insight-symbol">
          <ShieldCheck size={25} />
        </div>
        <div>
          <strong>Risk review queue</strong>
          <p>
            {data.open_alerts} alerts need a closer look across your project
            portfolio.
          </p>
        </div>
        <button onClick={() => go("alerts")}>
          Review alerts <ChevronRight size={16} />
        </button>
      </div>
      <div className="metrics">
        <Metric
          label="Total sanctioned"
          value={money(data.sanctioned)}
          sub={"Across " + data.projects + " projects"}
          icon={IndianRupee}
        />
        <Metric
          label="Funds utilized"
          value={money(data.expenditure)}
          sub={data.utilization + "% of sanctioned funds"}
          icon={ChartNoAxesCombined}
          bar={data.utilization}
        />
        <Metric
          label="Projects monitored"
          value={data.projects.toLocaleString("en-IN")}
          sub={data.completed + " completed projects"}
          icon={FolderKanban}
          tone="blue"
        />
        <Metric
          label="High-risk projects"
          value={String(data.high_risk).padStart(2, "0")}
          sub="Score of 65 or above"
          icon={ShieldAlert}
          tone="red"
        />
      </div>
      <div className="chart-grid">
        <Panel
          title="Fund utilization"
          subtitle="Cumulative allocation and expenditure · ₹ crore"
          action={
            <div className="chart-legend">
              <span>
                <i className="sanction" />
                Sanctioned
              </span>
              <span>
                <i />
                Expenditure
              </span>
            </div>
          }
        >
          <TrendChart data={data.trend} />
          <div className="chart-foot">
            <span>
              <CalendarDays size={14} /> Last six months
            </span>
            <span>Based on recorded payments</span>
          </div>
        </Panel>
        <Panel
          title="Portfolio risk"
          subtitle="Projects grouped by review priority"
        >
          <div className="donut-wrap">
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie
                  data={riskData}
                  dataKey="value"
                  innerRadius={65}
                  outerRadius={84}
                  paddingAngle={4}
                  stroke="none"
                  startAngle={90}
                  endAngle={-270}
                >
                  {["#2f7f5c", "#e5b966", "#d98476"].map((c) => (
                    <Cell key={c} fill={c} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center">
              <strong>{data.projects}</strong>
              <span>Total projects</span>
            </div>
          </div>
          <div className="risk-legend">
            {riskData.map((r, i) => (
              <button
                key={r.name}
                onClick={() =>
                  go("projects", { risk: ["Low", "Medium", "High"][i] })
                }
              >
                <span>
                  <i
                    style={{ background: ["#2f7f5c", "#e5b966", "#d98476"][i] }}
                  />
                  {r.name}
                </span>
                <b>{r.value}</b>
                <small>
                  {data.projects
                    ? Math.round((r.value / data.projects) * 100)
                    : 0}
                  %
                </small>
              </button>
            ))}
          </div>
        </Panel>
      </div>
      <div className="lower-grid">
        <Panel
          title="Projects that need attention"
          subtitle="Your highest-priority works, ranked by risk"
          action={
            <button
              className="text-btn"
              onClick={() => go("projects", { risk: "" })}
            >
              View all projects <ChevronRight size={15} />
            </button>
          }
        >
          <ProjectTable
            projects={projects.filter((p) => p.risk_score >= 35)}
            onSelect={openProject}
            compact
          />
        </Panel>
        <Panel
          title="Regional overview"
          subtitle="Average project risk by state"
          action={<Globe2 size={18} className="muted" />}
        >
          <div className="region-list">
            {data.regions.slice(0, 5).map((r, i) => (
              <div className="region-row" key={r.name}>
                <span className="region-initial">
                  {r.name
                    .split(" ")
                    .map((x) => x[0])
                    .join("")
                    .slice(0, 2)}
                </span>
                <div>
                  <strong>{r.name}</strong>
                  <small>
                    {r.projects} projects · {r.high} high risk
                  </small>
                  <div className="progress-track">
                    <i style={{ width: Math.max(r.risk, 3) + "%" }} />
                  </div>
                </div>
                <b>
                  {r.risk}
                  <small>/100</small>
                </b>
              </div>
            ))}
          </div>
          <button className="panel-bottom-btn" onClick={() => go("funds")}>
            Explore fund analytics <ChevronRight size={15} />
          </button>
        </Panel>
      </div>
      <div className="data-note">
        <ShieldCheck size={15} />
        <span>
          Verify risk signals against project records before taking action.
        </span>
        <span>Last analyzed {date(data.last_analysis?.created_at)}</span>
      </div>
    </>
  );
}
function Projects({
  projects,
  search,
  setSearch,
  risk,
  setRisk,
  sector,
  setSector,
  openProject,
  onNew,
  exportUrl,
  user,
}) {
  return (
    <Panel
      title="Project register"
      subtitle={projects.length + " works in your current view"}
      action={
        <div className="button-row">
          <a className="btn secondary small" href={exportUrl}>
            <Download size={15} />
            Export
          </a>
          {user.role !== "mp" && (
            <button className="btn primary small" onClick={onNew}>
              <Plus size={16} />
              Add project
            </button>
          )}
        </div>
      }
    >
      <div className="table-toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search projects"
            placeholder="Search name, project ID or district…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Risk level"
          value={risk}
          onChange={(e) => setRisk(e.target.value)}
        >
          <option value="">All risk levels</option>
          {["High", "Medium", "Low"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select
          aria-label="Sector"
          value={sector}
          onChange={(e) => setSector(e.target.value)}
        >
          <option value="">All sectors</option>
          {sectors.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        {(search || risk || sector) && (
          <button
            className="text-btn"
            onClick={() => {
              setSearch("");
              setRisk("");
              setSector("");
            }}
          >
            Clear
          </button>
        )}
      </div>
      <ProjectTable projects={projects} onSelect={openProject} />
    </Panel>
  );
}
function Alerts({ filters, tick, onReview, openProject, user }) {
  const [status, setStatus] = useState("");
  const { data, loading, error } = useData(
    "/alerts?" + query({ ...filters, status }),
    tick,
  );
  return (
    <>
      <div className="info-banner">
        <Info size={18} />
        <span>
          Alerts identify patterns that merit investigation. Review supporting
          records before reaching a conclusion.
        </span>
      </div>
      <div className="segmented">
        {["", "Open", "In review", "Resolved", "Dismissed"].map((s) => (
          <button
            className={status === s ? "active" : ""}
            key={s}
            onClick={() => setStatus(s)}
          >
            {s || "All alerts"}
          </button>
        ))}
      </div>
      <ErrorBox error={error} />
      {loading ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty
          title="You're all caught up"
          text="There are no alerts matching this view."
        />
      ) : (
        <div className="alert-grid">
          {data.map((a) => (
            <article className="panel alert-card" key={a.id}>
              <div className="alert-card-top">
                <span className={"alert-icon " + a.severity.toLowerCase()}>
                  <ShieldAlert size={20} />
                </span>
                <Badge>{a.severity}</Badge>
                <Badge>{a.status}</Badge>
              </div>
              <h3>{a.title}</h3>
              <button
                className="project-title"
                onClick={() => openProject(a.project_id)}
              >
                {a.name}
              </button>
              <p className="muted">
                {a.project_id} · {a.district}, {a.state}
              </p>
              <div className="alert-evidence">
                {a.reasons.slice(0, 2).map((r) => (
                  <p key={r.kind}>
                    <span />
                    {r.detail}
                  </p>
                ))}
              </div>
              <div className="alert-card-footer">
                <Risk score={a.risk_score} level={a.severity} />
                <button
                  className="btn secondary small"
                  onClick={() => onReview(a)}
                >
                  {user.role === "mp"
                    ? "View review"
                    : a.status === "Open"
                      ? "Review alert"
                      : "View case"}
                  <ChevronRight size={15} />
                </button>
              </div>
              {a.reviews.length > 0 && (
                <div className="review-meta">
                  Last reviewed by {a.reviews[0].author}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
function Funds({ data }) {
  return (
    <>
      <div className="metrics three">
        <Metric
          label="Sanctioned allocation"
          value={money(data.sanctioned)}
          sub={data.projects + " monitored works"}
          icon={Landmark}
        />
        <Metric
          label="Recorded expenditure"
          value={money(data.expenditure)}
          sub={data.utilization + "% utilization"}
          icon={IndianRupee}
          bar={data.utilization}
        />
        <Metric
          label="Unspent allocation"
          value={money(Math.max(data.sanctioned - data.expenditure, 0))}
          sub={
            data.expenditure > data.sanctioned
              ? "Aggregate expenditure exceeds sanction"
              : "Sanctioned less recorded expenditure"
          }
          icon={Activity}
          tone="blue"
        />
      </div>
      <Panel
        title="Funds over time"
        subtitle="Cumulative amounts in ₹ crore"
        action={
          <div className="chart-legend">
            <span>
              <i className="sanction" />
              Sanctioned
            </span>
            <span>
              <i />
              Expenditure
            </span>
          </div>
        }
      >
        <TrendChart data={data.trend} />
      </Panel>
      <div className="equal-grid">
        <Panel
          title="Allocation by sector"
          subtitle="Sanctioned funds · ₹ crore"
        >
          <div className="sector-chart">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={data.sectors.map((x) => ({
                  ...x,
                  allocation: +(x.value / 1e7).toFixed(2),
                }))}
                layout="vertical"
                margin={{ left: 20, right: 30 }}
              >
                <CartesianGrid horizontal={false} stroke="#e9edea" />
                <XAxis type="number" tickLine={false} axisLine={false} />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={116}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip formatter={(v) => "₹" + v + " Cr"} />
                <Bar
                  dataKey="allocation"
                  fill="#408364"
                  radius={[0, 5, 5, 0]}
                  barSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="State expenditure" subtitle="Recorded payments by state">
          <div className="state-funds">
            {data.regions.map((r) => (
              <div key={r.name}>
                <span>
                  {r.name}
                  <small>{r.projects} projects</small>
                </span>
                <strong>{money(r.spent)}</strong>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
function DataSources({ data, onImport, user }) {
  return (
    <>
      <div className="source-hero">
        <span className="source-hero-icon">
          <Database size={32} />
        </span>
        <div>
          <h2>Import project records</h2>
          <p>
            Bring project records into one place. Validate, analyze, and start
            your review.
          </p>
        </div>
        {user.role !== "mp" && (
          <button className="btn primary" onClick={onImport}>
            <UploadCloud size={17} />
            Import CSV
          </button>
        )}
      </div>
      <div className="equal-grid">
        <Panel
          title="Project dataset"
          subtitle="Persistent records in this workspace"
          action={<Badge type="connected">Connected</Badge>}
        >
          <div className="dataset-stats">
            <div>
              <strong>{data.projects}</strong>
              <span>Project records</span>
            </div>
            <div>
              <strong>{data.regions.length}</strong>
              <span>States represented</span>
            </div>
            <div>
              <strong>{data.demo_projects}</strong>
              <span>Demo records</span>
            </div>
          </div>
          <div className="source-details">
            <p>
              <span>Storage</span>
              <strong>Workspace database</strong>
            </p>
            <p>
              <span>Supported import</span>
              <strong>UTF-8 CSV · up to 1,000 rows</strong>
            </p>
            <p>
              <span>Last analysis</span>
              <strong>{date(data.last_analysis?.created_at)}</strong>
            </p>
          </div>
        </Panel>
        <Panel
          title="Import with confidence"
          subtitle="A consistent format, every time"
        >
          <ol className="steps">
            <li>
              <span>1</span>
              <div>
                <strong>Start with the template</strong>
                <p>Add project, allocation, spending, and progress fields.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Upload and validate</strong>
                <p>
                  Incorrect rows and repeated imports are rejected before
                  saving.
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Review fresh insights</strong>
                <p>Saved projects are automatically analyzed for risk.</p>
              </div>
            </li>
          </ol>
          <a
            className="btn secondary template-link"
            href="/api/import/template"
          >
            <Download size={16} />
            Download CSV template
          </a>
        </Panel>
      </div>
      <div className="info-banner">
        <Info size={18} />
        <span>
          {data.demo_projects > 0
            ? "This workspace includes synthetic demonstration records. They do not represent actual spending or findings about any authority."
            : "Imported records are supplied by workspace users. Verify source documents before making decisions."}{" "}
          No official MPLADS feed is connected.
        </span>
      </div>
    </>
  );
}
function Reports({ filters, tick, exportUrl, overview }) {
  const { data: audit, loading, error } = useData("/audit", tick);
  return (
    <>
      <div className="report-grid">
        <article className="panel report-card">
          <span className="report-icon">
            <FileSpreadsheet size={26} />
          </span>
          <Badge type="low">CSV report</Badge>
          <h3>Project oversight report</h3>
          <p>
            Project details, spending, progress, and risk scores for the current
            state and year.
          </p>
          <div className="report-summary">
            {overview.projects} projects <span>·</span>{" "}
            {filters.state || "All accessible states"}
          </div>
          <a href={exportUrl} className="btn primary">
            <Download size={16} />
            Download report
          </a>
        </article>
        <article className="panel report-card">
          <span className="report-icon amber">
            <ShieldAlert size={26} />
          </span>
          <Badge type="medium">Risk report</Badge>
          <h3>High-risk project register</h3>
          <p>
            A focused export of projects with scores of 65 and above for further
            investigation.
          </p>
          <div className="report-summary">
            {overview.high_risk} high-risk projects <span>·</span> Current
            filters
          </div>
          <a
            href={"/api/export?" + query({ ...filters, risk: "High" })}
            className="btn secondary"
          >
            <Download size={16} />
            Export risk register
          </a>
        </article>
      </div>
      <Panel
        title="Audit trail"
        subtitle="A record of actions taken in your workspace"
        action={<History size={19} className="muted" />}
      >
        <ErrorBox error={error} />
        {loading ? (
          <Spinner />
        ) : !audit?.length ? (
          <Empty
            title="No activity yet"
            text="Project changes and review decisions will appear here."
          />
        ) : (
          <div className="audit-list">
            {audit.map((a) => (
              <div key={a.id}>
                <span className="audit-icon">
                  <Check size={15} />
                </span>
                <div>
                  <strong>{a.action}</strong>
                  <p>{a.detail || a.entity}</p>
                  <small>
                    {a.actor} · {a.entity}
                  </small>
                </div>
                <time>
                  {date(a.created_at)}
                  <small>
                    {new Date(a.created_at).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </time>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
function Model({ tick, onRun, running, user }) {
  const { data, loading, error } = useData("/analysis", tick);
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  return (
    <>
      <div className="model-hero">
        <span>
          <BrainCircuit size={34} />
        </span>
        <div>
          <Badge type="connected">Explainable by design</Badge>
          <h2>Anomaly detection methods</h2>
          <p>
            Statistical learning finds unusual patterns. Transparent rules make
            them actionable.
          </p>
        </div>
        {user.role === "ministry" && (
          <button className="btn primary" onClick={onRun} disabled={running}>
            <RefreshCw size={17} className={running ? "spin" : ""} />
            {running ? "Analyzing…" : "Run analysis"}
          </button>
        )}
      </div>
      <div className="model-cards">
        {[
          [
            BrainCircuit,
            "Isolation Forest",
            "150 trees isolate unusual combinations of spending, progress, delays and project cost. A fixed random seed keeps runs reproducible.",
          ],
          [
            ChartNoAxesCombined,
            "Cluster distance",
            "Robust-scaled features are grouped with K-Means. Projects above the 95th percentile of cluster distance receive an additional signal.",
          ],
          [
            ShieldCheck,
            "Transparent risk rules",
            "Cost overruns, overdue works, spending gaps, sector cost outliers and location-matched work descriptions contribute explicit points.",
          ],
        ].map(([I, t, d]) => (
          <article className="panel model-card" key={t}>
            <I size={25} />
            <h3>{t}</h3>
            <p>{d}</p>
          </article>
        ))}
      </div>
      <div className="equal-grid">
        <Panel
          title="How to read a risk score"
          subtitle="An additive priority index, capped at 99"
        >
          <div className="thresholds">
            <p>
              <Badge>Low</Badge>
              <strong>0–34</strong>
              <span>Routine monitoring</span>
            </p>
            <p>
              <Badge>Medium</Badge>
              <strong>35–64</strong>
              <span>Review supporting records</span>
            </p>
            <p>
              <Badge>High</Badge>
              <strong>65–99</strong>
              <span>Prioritize investigation</span>
            </p>
          </div>
          <p className="panel-note">
            Scores are not probabilities of fraud. Thresholds are demonstration
            defaults and require calibration against verified local records
            before operational use. Machine learning activates with at least 10
            projects; rules work on smaller datasets.
          </p>
        </Panel>
        <Panel title="Model inputs" subtitle={data.version}>
          <div className="feature-list">
            {data.features.map((f, i) => (
              <div key={f}>
                <span>0{i + 1}</span>
                {f}
                <Check size={16} />
              </div>
            ))}
          </div>
        </Panel>
      </div>
      {user.role === "ministry" && (
        <Panel title="Analysis history" subtitle="Latest model runs">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Run date</th>
                  <th>Initiated by</th>
                  <th>Projects</th>
                  <th>Flagged</th>
                  <th>Model</th>
                </tr>
              </thead>
              <tbody>
                {data.runs.map((r) => (
                  <tr key={r.id}>
                    <td>{date(r.created_at)}</td>
                    <td>{r.actor}</td>
                    <td>{r.project_count}</td>
                    <td>{r.flagged_count}</td>
                    <td>
                      <code>{r.model_version}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}
function Settings({ user, config, tick, onUser }) {
  const { data, loading, error } = useData(
    user.role === "ministry" ? "/users" : null,
    tick,
  );
  return (
    <>
      <Panel title="Your workspace" subtitle="Account and access details">
        <div className="settings-info">
          <div>
            <span>Signed in as</span>
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </div>
          <div>
            <span>Access level</span>
            <strong>{roleNames[user.role]}</strong>
            <small>{user.scope || "All states and constituencies"}</small>
          </div>
          <div>
            <span>Environment</span>
            <strong>
              {config.demo_mode
                ? "Demonstration workspace"
                : "Private workspace"}
            </strong>
            <small>Session expires after 8 hours</small>
          </div>
        </div>
      </Panel>
      {user.role === "ministry" && (
        <Panel
          title="Workspace members"
          subtitle="Access is enforced by the backend"
          action={
            <button className="btn primary small" onClick={onUser}>
              <Plus size={15} />
              Add member
            </button>
          }
        >
          <ErrorBox error={error} />
          {loading ? (
            <Spinner />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Role</th>
                    <th>Scope</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.name}</strong>
                        <small>{u.email}</small>
                      </td>
                      <td>{roleNames[u.role]}</td>
                      <td>{u.scope || "National"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
      <div className="info-banner">
        <LockKeyhole size={18} />
        <span>
          Ministry accounts manage all records. State and district accounts are
          restricted to their assigned region. MP accounts have read-only access
          to their constituency.
        </span>
      </div>
    </>
  );
}
function Login({ config, onLogin }) {
  const [error, setError] = useState(null),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLogin(
        await api("/auth/login", {
          method: "POST",
          body: Object.fromEntries(new FormData(e.target)),
        }),
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-story">
        <div className="brand">
          <span className="brand-mark">
            <Landmark size={25} />
          </span>
          <span>
            MPLADS<span className="brand-sub">INSIGHT</span>
          </span>
        </div>
        <div>
          <span className="eyebrow">PUBLIC FUNDS. CLEARER OVERSIGHT.</span>
          <h1>
            Better signals.
            <br />
            Better decisions.
            <br />
            <em>Greater impact.</em>
          </h1>
          <p>
            A connected view of projects, public spending, and the signals that
            deserve your attention.
          </p>
          <div className="login-trust">
            <ShieldCheck size={21} />
            <span>Explainable intelligence for accountable governance</span>
          </div>
        </div>
        <small>
          Project by Bhoomi Roy · Independent academic implementation
        </small>
      </div>
      <div className="login-form-wrap">
        <div className="login-form">
          <span className="login-logo">
            <LockKeyhole size={25} />
          </span>
          <h2>Welcome to Insight</h2>
          <p>Sign in to your oversight workspace.</p>
          <ErrorBox error={error} />
          <form onSubmit={submit}>
            <Field label="Email address">
              <input
                type="email"
                name="email"
                required
                autoComplete="username"
                placeholder="you@organisation.gov.in"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                name="password"
                minLength={12}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
              />
            </Field>
            <button className="btn primary full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          {config.demo_mode && (
            <div className="demo-entry">
              <span>Explore with synthetic project data</span>
              <button
                className="btn secondary full"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    onLogin(
                      await api("/auth/demo", {
                        method: "POST",
                        body: { role: "ministry" },
                      }),
                    );
                  } catch (e) {
                    setError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Open demo workspace
              </button>
            </div>
          )}
          <p className="login-help">
            Need access? Contact your workspace administrator.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [config, setConfig] = useState(null),
    [user, setUser] = useState(null),
    [booting, setBooting] = useState(true),
    [fatal, setFatal] = useState(null);
  const [page, setPage] = useState(
      location.pathname.split("/")[1] || "overview",
    ),
    [mobile, setMobile] = useState(false),
    [tick, setTick] = useState(0);
  const [state, setState] = useState(""),
    [year, setYear] = useState(""),
    [search, setSearch] = useState(""),
    [risk, setRisk] = useState(""),
    [sector, setSector] = useState("");
  const [modal, setModal] = useState(null),
    [toast, setToast] = useState(""),
    [running, setRunning] = useState(false),
    [globalSearch, setGlobalSearch] = useState("");
  const searchRef = useRef();
  function login(u) {
    setSession(u);
    setUser(u);
    sessionStorage.removeItem("insight_signed_out");
    setState("");
    setYear("");
    setTick((t) => t + 1);
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const cfg = await api("/config");
        if (!active) return;
        setConfig(cfg);
        let u;
        try {
          u = await api("/auth/me");
        } catch (e) {
          if (e.status !== 401) throw e;
          if (cfg.demo_mode && !sessionStorage.getItem("insight_signed_out"))
            u = await api("/auth/demo", {
              method: "POST",
              body: { role: "ministry" },
            });
        }
        if (active && u) login(u);
      } catch (e) {
        if (active) setFatal(e);
      } finally {
        if (active) setBooting(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const handler = () =>
      setPage(location.pathname.split("/")[1] || "overview");
    window.addEventListener("popstate", handler);
    const keyboard = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("popstate", handler);
      window.removeEventListener("keydown", keyboard);
    };
  }, []);
  useEffect(() => {
    const expired = () => {
      setSession(null);
      setUser(null);
      sessionStorage.setItem("insight_signed_out", "1");
      setModal(null);
    };
    window.addEventListener("insight-expired", expired);
    return () => window.removeEventListener("insight-expired", expired);
  }, []);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(id);
    }
  }, [toast]);
  function go(p, extra = {}) {
    setPage(p);
    history.pushState({}, "", p === "overview" ? "/" : "/" + p);
    setMobile(false);
    if (extra.risk !== undefined) {
      setRisk(extra.risk);
      setSearch("");
      setSector("");
    }
  }
  function saved(message) {
    setModal(null);
    setTick((t) => t + 1);
    setToast(message);
  }
  async function run() {
    setRunning(true);
    try {
      const r = await api("/analysis/run", { method: "POST" });
      setTick((t) => t + 1);
      setToast(
        r.project_count +
          " projects analyzed. " +
          r.flagged_count +
          " need review.",
      );
    } catch (e) {
      setToast(e.message);
    } finally {
      setRunning(false);
    }
  }
  const filters = [
      "overview",
      "projects",
      "alerts",
      "funds",
      "reports",
    ].includes(page)
      ? { state, year }
      : {},
    filterString = query(filters);
  const overview = useData(user ? "/overview?" + filterString : null, tick);
  const options = useData(user ? "/options" : null, tick);
  const projects = useData(
    user
      ? "/projects?" +
          query({
            ...filters,
            ...(page === "projects" ? { q: search, risk, sector } : {}),
          })
      : null,
    tick,
  );
  const exportUrl =
    "/api/export?" +
    query({
      ...filters,
      ...(page === "projects" ? { q: search, risk, sector } : {}),
    });
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      setSession(null);
      sessionStorage.setItem("insight_signed_out", "1");
    } catch (e) {
      setToast(e.message);
    }
  }
  if (booting)
    return (
      <div className="boot">
        <Landmark size={40} />
        <h2>MPLADS Insight</h2>
        <Spinner />
      </div>
    );
  if (fatal)
    return (
      <div className="boot">
        <ErrorBox error={fatal} />
        <button className="btn primary" onClick={() => location.reload()}>
          Retry connection
        </button>
      </div>
    );
  if (!user) return <Login config={config} onLogin={login} />;
  const info = {
    overview: [
      "Portfolio overview",
      "Monitor sanctioned works, fund utilization and outstanding risk alerts.",
    ],
    projects: [
      "Project register",
      "Track every work, from sanction to completion.",
    ],
    alerts: ["Risk & alerts", "Focus your attention where it matters most."],
    funds: [
      "Fund analytics",
      "Understand where funds go and what they deliver.",
    ],
    data: ["Data sources", "One reliable foundation for better oversight."],
    reports: [
      "Reports & activity",
      "Turn your oversight into a clear, shareable record.",
    ],
    model: [
      "Model insights",
      "Understand the intelligence behind every signal.",
    ],
    settings: ["Workspace settings", "Manage your team and their access."],
  }[page] || ["Portfolio overview", "A clearer view of public impact."];
  return (
    <div className="app-shell">
      {mobile && (
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <aside className={"sidebar " + (mobile ? "is-open" : "")}>
        <button className="brand" onClick={() => go("overview")}>
          <span className="brand-mark">
            <Landmark size={24} />
          </span>
          <span>
            MPLADS<span className="brand-sub">INSIGHT</span>
          </span>
        </button>
        <div className="workspace-label">
          <span className="workspace-icon">
            <Building2 size={17} />
          </span>
          <div>
            <strong>{user.scope || "National workspace"}</strong>
            <small>
              {user.role === "ministry"
                ? "Ministry overview"
                : "Regional oversight"}
            </small>
          </div>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {NAV.map(([id, label, I]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => go(id)}
            >
              <I size={19} />
              <span>{label}</span>
              {id === "alerts" && overview.data?.open_alerts > 0 && (
                <b>{overview.data.open_alerts}</b>
              )}
              {id === "model" && <span className="ai-label">AI</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="oversight-note">
            <ShieldCheck size={22} />
            <strong>Risk scoring guide</strong>
            <p>
              See model inputs, thresholds and the reasons behind each alert.
            </p>
            <button onClick={() => go("model")}>
              How risk scoring works <ChevronRight size={14} />
            </button>
          </div>
          <button
            className={"settings-nav " + (page === "settings" ? "active" : "")}
            onClick={() => go("settings")}
          >
            <Settings2 size={18} />
            Workspace settings
          </button>
          <div className="sidebar-user">
            <span className="avatar">
              {user.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div>
              <strong>{user.name}</strong>
              <small>
                {user.role === "ministry"
                  ? "Ministry administrator"
                  : roleNames[user.role]}
              </small>
            </div>
            <button onClick={logout} className="icon-btn" aria-label="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-menu"
              onClick={() => setMobile(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{NAV.find((x) => x[0] === page)?.[1] || "Settings"}</strong>
          </div>
          <div className="topbar-right">
            <form
              className="global-search"
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(globalSearch);
                setRisk("");
                setSector("");
                go("projects");
              }}
            >
              <Search size={16} />
              <input
                ref={searchRef}
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search projects…"
                aria-label="Global project search"
              />
              <kbd>Ctrl K</kbd>
            </form>
            {config.demo_mode && (
              <label className="demo-switch">
                <span className="demo-dot" />
                Demo
                <select
                  aria-label="Switch demo role"
                  value={user.role}
                  onChange={async (e) => {
                    try {
                      login(
                        await api("/auth/demo", {
                          method: "POST",
                          body: { role: e.target.value },
                        }),
                      );
                      go("overview");
                    } catch (e) {
                      setToast(e.message);
                    }
                  }}
                >
                  {Object.entries(roleNames).map(([k, v]) => (
                    <option value={k} key={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <ChevronDown size={12} />
              </label>
            )}
            <button
              className="notification-btn"
              onClick={() => go("alerts")}
              aria-label="View risk alerts"
            >
              <Bell size={19} />
              {overview.data?.open_alerts > 0 && <i />}
            </button>
            <span className="top-avatar">
              {user.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {user.scope || "NATIONAL OVERSIGHT"}
              </div>
              <h1>{info[0]}</h1>
              <p>{info[1]}</p>
            </div>
            <div className="button-row">
              {["overview", "projects", "funds", "reports"].includes(page) && (
                <a className="btn secondary" href={exportUrl}>
                  <Download size={16} />
                  Export report
                </a>
              )}
              {page === "overview" && user.role === "ministry" && (
                <button
                  className="btn primary"
                  onClick={run}
                  disabled={running}
                >
                  <RefreshCw size={16} className={running ? "spin" : ""} />
                  {running ? "Analyzing…" : "Run analysis"}
                </button>
              )}
            </div>
          </div>
          {["overview", "projects", "alerts", "funds", "reports"].includes(
            page,
          ) && (
            <div className="filter-bar">
              <div>
                <SlidersHorizontal size={16} />
                <select
                  aria-label="Filter by state"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                >
                  <option value="">All accessible states</option>
                  {options.data?.state.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <span className="filter-divider" />
                <select
                  aria-label="Filter by financial year"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                >
                  <option value="">All financial years</option>
                  {options.data?.fiscal_year.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                {(state || year) && (
                  <button
                    className="text-btn"
                    onClick={() => {
                      setState("");
                      setYear("");
                    }}
                  >
                    Reset
                  </button>
                )}
              </div>
              <span className="as-of">
                <span />
                As of {date(overview.data?.as_of)}
              </span>
            </div>
          )}
          <ErrorBox error={overview.error || projects.error} />
          {overview.error ? null : overview.loading || !overview.data ? (
            <Spinner />
          ) : (
            <>
              {(page === "overview" ||
                ![
                  "projects",
                  "alerts",
                  "funds",
                  "data",
                  "reports",
                  "model",
                  "settings",
                ].includes(page)) && (
                <Overview
                  data={overview.data}
                  projects={projects.data || []}
                  go={go}
                  openProject={(id) => setModal({ type: "project", id })}
                  onRun={run}
                  running={running}
                  user={user}
                />
              )}
              {page === "projects" && (
                <Projects
                  projects={projects.data || []}
                  search={search}
                  setSearch={setSearch}
                  risk={risk}
                  setRisk={setRisk}
                  sector={sector}
                  setSector={setSector}
                  openProject={(id) => setModal({ type: "project", id })}
                  onNew={() => setModal({ type: "new" })}
                  exportUrl={exportUrl}
                  user={user}
                />
              )}
              {page === "alerts" && (
                <Alerts
                  filters={filters}
                  tick={tick}
                  onReview={(alert) => setModal({ type: "review", alert })}
                  openProject={(id) => setModal({ type: "project", id })}
                  user={user}
                />
              )}
              {page === "funds" && <Funds data={overview.data} />}
              {page === "data" && (
                <DataSources
                  data={overview.data}
                  onImport={() => setModal({ type: "import" })}
                  user={user}
                />
              )}
              {page === "reports" && (
                <Reports
                  filters={filters}
                  tick={tick}
                  exportUrl={exportUrl}
                  overview={overview.data}
                />
              )}
              {page === "model" && (
                <Model tick={tick} onRun={run} running={running} user={user} />
              )}
              {page === "settings" && (
                <Settings
                  user={user}
                  config={config}
                  tick={tick}
                  onUser={() => setModal({ type: "user" })}
                />
              )}
            </>
          )}
          <footer className="page-footer">
            <span>MPLADS Insight</span>
            <span>
              {overview.data?.demo_projects > 0
                ? "Synthetic demonstration data"
                : "User-supplied project data"}{" "}
              <span>·</span> v1.0
            </span>
          </footer>
        </main>
      </div>
      {modal?.type === "project" && (
        <ProjectDrawer
          id={modal.id}
          user={user}
          onClose={() => setModal(null)}
          onSaved={(message) => {
            setTick((t) => t + 1);
            setToast(message);
          }}
          onReview={(alert) => setModal({ type: "review", alert })}
        />
      )}
      {modal?.type === "new" && (
        <NewProject
          user={user}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      )}
      {modal?.type === "import" && (
        <ImportDialog onClose={() => setModal(null)} onSaved={saved} />
      )}
      {modal?.type === "review" && (
        <ReviewDialog
          alert={modal.alert}
          user={user}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      )}
      {modal?.type === "user" && (
        <NewUser onClose={() => setModal(null)} onSaved={saved} />
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          <span>{toast}</span>
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
