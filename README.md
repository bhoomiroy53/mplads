---
title: MPLADS Insight
emoji: 🏛️
colorFrom: green
colorTo: gray
sdk: docker
app_port: 7860
---

# 🏛️ MPLADS Insight

**MPLADS Insight** is an end-to-end public expenditure auditing, fund reconciliation, and anomaly detection platform built for reviewing Member of Parliament Local Area Development Scheme (MPLADS) works. It enables oversight teams to reconcile sanctioned funds against disbursed payments, track physical completion milestones, register post-completion public assets, and triage high-risk projects through a deterministic, multi-signal risk engine.

React, Vite, and Recharts power the interactive analytical interface, while FastAPI, SQLite, and scikit-learn serve the REST API, transactional persistence layer, and hybrid anomaly-scoring pipeline from a single unified origin.

---

## 📋 Table of Contents

- [Key Capabilities](#-key-capabilities)
- [System Architecture](#-system-architecture)
- [Anomaly Detection & Risk Scoring Engine](#-anomaly-detection--risk-scoring-engine)
- [Role-Based Access Control & Security](#-role-based-access-control--security)
- [Quickstart: Windows Local Demo](#-quickstart-windows-local-demo)
- [End-to-End Audit Walkthrough](#-end-to-end-audit-walkthrough)
- [Data Ingestion, Accounting Rules & Exports](#-data-ingestion-accounting-rules--exports)
- [Production & Docker Deployment](#-production--docker-deployment)
- [Configuration Reference](#-configuration-reference)
- [Local Development & Verification](#-local-development--verification)
- [Scope, Limitations & Disclaimer](#-scope-limitations--disclaimer)

---

## ✨ Key Capabilities

- **Fund & Payment Reconciliation:** Tracks sanctioned amounts, initial cost estimates, and itemized disbursements with strict duplicate payment reference rejection.
- **Hybrid Anomaly Detection:** Combines deterministic rule-based heuristics with unsupervised machine learning (`IsolationForest` and `KMeans`) to surface financial, schedule, and duplicate-work anomalies.
- **Case Management & Audit Trail:** Supports structured review workflows (`Open` → `In review` → resolved states), evidence requests, reviewer notes, and immutable activity logs.
- **Post-Completion Asset Registry:** Records custodian details, asset reference IDs, and handover dates once physical works reach completion.
- **Atomic Batch CSV Ingestion:** Validates up to 1,000 rows (5 MB) per upload with row-level error diagnostics and all-or-nothing transactional rollback.
- **Scoped Multi-Tier Governance:** Enforces hierarchical data isolation across Ministry, State, District, and Constituency boundaries directly at the API layer.

---

## 🏗️ System Architecture

MPLADS Insight is packaged as a single-origin monolith where FastAPI serves both the `/api` endpoints and the compiled static React bundle (`dist/`) on port `7860`.

```text
┌──────────────────────────────────────────────────────────────────────┐
│                         Client (Browser)                             │
│        React + Vite + Recharts (Dashboard, Audit, Analytics)         │
└─────────────────────────────────┬────────────────────────────────────┘
                                  │ HTTPS / Same-Origin (Port 7860)
                                  │ Session Cookie + X-CSRF-Token
┌─────────────────────────────────▼────────────────────────────────────┐
│                       FastAPI Application                            │
│  ┌────────────────────┐  ┌───────────────────┐  ┌─────────────────┐  │
│  │  RBAC & Scope      │  │  CSV Validator &  │  │  Hybrid Risk &  │  │
│  │  Middleware        │  │  Export Engine    │  │  Anomaly Engine │  │
│  └────────────────────┘  └───────────────────┘  └─────────────────┘  │
└─────────────────────────────────┬────────────────────────────────────┘
                                  │ Single-Worker SQLite Connection
┌─────────────────────────────────▼────────────────────────────────────┐
│                     SQLite Persistent Storage                        │
│  Projects · Payments · Assets · Reviews · Model Runs · Audit Trail   │
└──────────────────────────────────────────────────────────────────────┘
