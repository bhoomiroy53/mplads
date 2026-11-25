---
title: MPLADS Insight
emoji: 🏛️
colorFrom: green
colorTo: gray
sdk: docker
app_port: 7860
---

# MPLADS Insight

MPLADS Insight helps reviewers examine public works, reconcile sanctioned funds with recorded payments, and investigate unusual project outcomes. React serves the entire interface. FastAPI, SQLite and scikit-learn provide the API, storage and detection engine.

## Run the Windows demo

Install Python 3.11 and Node.js 22.12+ or 24+. Double-click **Launch MPLADS Insight.cmd** in this folder, then open **http://127.0.0.1:7860**. The launcher installs dependencies and builds the React app. Leave the terminal open while using the application. Ctrl+C stops it. Run the same launcher to reopen your saved workspace.

The local demo starts with 96 synthetic projects across eight states. Choose a role using the Demo menu. The shared role accounts and sample spending figures are intended for demonstration. Keep private records in a separate private database.

## Try a complete review

1. Select **High risk** on the overview. Open a project to see its budget, payments and weighted risk signals.
2. Open **Review alert**, record an evidence request, and change the case to **In review**. The decision appears in the project activity and audit trail.
3. Add a payment or update physical progress. The database, scores, alerts and charts update together. A repeated payment reference is rejected.
4. For a completed work, open **Asset** to register the custodian, asset reference and handover date.
5. Under **Data sources**, download the CSV template, add your projects and import the file. Validation identifies individual rows. One invalid row prevents the entire import. Project register exports include the active filters.

## Private deployment

Use a fresh persistent data directory. The Docker image runs as UID 1000 and serves both the compiled React frontend and the API on port 7860. Configure an HTTPS reverse proxy and a writeable persistent volume. Run a single application worker per database. Back up SQLite with its online backup API and test a restore before using operational records.

| Environment variable | Purpose |
| --- | --- |
| DEMO_MODE | Defaults to false. True enables synthetic records and unauthenticated role selection. |
| DATA_DIR | SQLite directory. The container uses /data. Use separate volumes for demos and private deployments. |
| ADMIN_EMAIL | Email used to provision the initial Ministry account. |
| ADMIN_PASSWORD | Initial password, at least 12 characters. Supply through your host's secret manager. |
| ADMIN_NAME | Optional display name. |
| SECURE_COOKIES | True for HTTPS. Set false only for local HTTP testing. |

For Docker, build with `docker build -t mplads-insight .`. Start the container with a persistent volume and administrator credentials supplied from your environment:

```sh
docker run --name mplads-insight -p 127.0.0.1:7860:7860 -v mplads-private:/data -e ADMIN_EMAIL -e ADMIN_PASSWORD mplads-insight
```

For a Hugging Face Docker Space, use this folder as the repository root. Supply the same secrets and a persistent mount at /data. For an ephemeral synthetic demo, set DEMO_MODE=true and DATA_DIR=/tmp/mplads-demo. For private records configure private visibility, HTTPS and persistent storage. [Docker Spaces documentation](https://huggingface.co/docs/hub/en/spaces-sdks-docker).

## Architecture and access

- React, Vite and Recharts render the dashboard, project details, case review, analytics, CSV import, exports and workspace settings.
- FastAPI enforces Ministry, state, district and constituency access on the server. MP accounts have read-only project access. State, district and constituency names in user scopes must match project records. Provision members under Workspace settings.
- SQLite tracks projects, payment references, completed assets, reviews, model runs, accounts, sessions and the audit trail. Passwords use salted PBKDF2. Sessions expire after eight hours. Writes require a session-bound CSRF token.
- Opening expenditure imported from CSV is represented by a single opening-balance entry dated at the supplied start date. Historical trends inherit that assumption. For exact cash-flow history, start with zero opening expenditure and record dated payments.
- Imports accept INR amounts and ISO dates. The optional estimated_cost field holds the initial estimate. Required dates follow the supplied start and planned-completion timeline. An import accepts up to 1,000 rows and 5 MB.
- The anomaly engine combines Isolation Forest, K-Means distance, sector cost deviations, start and due dates, estimate variance, spending gaps and possible duplicate works. Rules work on small datasets. The learned models activate from ten records. Runs are deterministic on the same data and analysis date. High risk begins at 65 and medium at 35. Scores cap at 99.
- Scores prioritize human investigation. Predictive accuracy on official MPLADS data has not been evaluated. Live government data integration is outside this implementation.

## Development and verification

Install the dependencies in requirements.txt and requirements-dev.txt, then run `python -m pytest -q`. Tests use isolated temporary databases. Run `npm ci` followed by `npm run build` to create the production frontend. The backend serves dist at the root URL.

For frontend development, run the API with DEMO_MODE=true and DEV_ORIGIN=http://127.0.0.1:5173, then run `npm run dev` and open the printed URL. Vite proxies /api to port 7860. Start the API from this directory with `python -m uvicorn backend.main:app --host 127.0.0.1 --port 7860`.

