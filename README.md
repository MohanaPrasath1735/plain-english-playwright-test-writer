# Autonomous Plain-English Playwright Test Writer Agent

An autonomous AI QA engineering platform that transforms plain-English descriptions of user flows into hardened, executable Playwright test scripts. The platform browses live web applications, reasons about accessible semantic locators, prompts Google Gemini for spec drafting, evaluates and upgrades weak assertions using a Critic agent, requires human approval gates, runs automated stability reruns, directly queries application database state, and presents full lifecycle telemetry in an interactive web dashboard.

---

## Architecture

The platform operates on a deterministic 8-station pipeline architecture:

```
[1. Understand] ➔ [2. Browse] ➔ [3. Reason] ➔ [4. Critic] ➔ [5. Approval] ➔ [6. Run & Rerun] ➔ [7. Verify] ➔ [8. Report]
```

1. **Understand (`1_understand.ts`)**:
   - Ingests user input `{ testCaseId, flow_description, expected_end_state }`.
   - Validates input schemas with Zod and resolves the target base URL dynamically from `APP_BASE_URL`.
2. **Browse (`2_browse.ts`)**:
   - Launches headless Chromium via Playwright.
   - Navigates to the live target page, inspecting the active DOM to harvest accessible roles, text content, placeholders, labels, and visual DOM snapshots with timestamps.
3. **Reason (`3_reason.ts`)**:
   - Evaluates harvested elements to choose robust, user-facing locators (`getByRole`, `getByPlaceholder`, `getByLabel`) over brittle CSS selectors.
   - Flags any unresolved locators with human-readable diagnostic messages.
4. **Critic (`5_critic.ts` & `4_draft.ts`)**:
   - Drafts the initial Playwright TypeScript spec (`.spec.ts`) using Google Gemini with fresh synthetic test data (UUIDs, zero real PII).
   - The **Critic Agent** inspects assertions in the draft: detects and rejects superficial checks (e.g. `expect(page).toHaveURL(...)`), upgrading them to verify concrete in-page authenticated state (e.g. profile link visible in the navbar).
5. **Human Approval Gate (`6_approval.ts`)**:
   - Halts the pipeline for human review of proposed locators, draft code, and critic assessments.
   - Records the reviewer (`human`) and execution timestamp; blocks duplicate executions across retries.
6. **Run & Rerun (`7_runner.ts`)**:
   - Executes the test suite twice: **Run 1** and a **Stability Rerun** using freshly generated synthetic credentials to detect state collisions or flakiness.
   - Captures console output, full-page screenshots, and zipped Playwright execution traces.
7. **Verify (`8_verify.ts`)**:
   - Evaluates observed vs intended outcomes without masking errors.
   - Connects directly to the application database (Conduit SQLite: `prisma/db.sqlite`) to confirm record insertion and verify duplicate prevention via `SELECT COUNT(*) FROM User WHERE email = ?`.
8. **Report (`9_store.ts` & `10_webui.ts`)**:
   - Persists all run records, step event timestamps, and artifacts into local SQLite (`agent_data.sqlite`).
   - Serves the live telemetry dashboard featuring the 8-station metro stepper, active benchmark runs, custom scenario runs, and downloadable evidence.

---

## Key Features

- **Plain-English to Playwright Spec**: Converts natural language user flows into production-ready TypeScript Playwright tests.
- **Deterministic Critic Review**: Automatically identifies and rejects shallow URL assertions, rewriting specs to assert authentic DOM state.
- **Negative Testing & Diagnostics**: Accurately diagnoses and isolates intentional selector mutations (e.g. TC2) without masking errors.
- **Database State Proof**: Verifies backend database records directly in SQLite to guarantee zero duplicate accounts across reruns.
- **Self-Healing Selectors (Bonus)**: Re-inspects failing pages and proposes resilient semantic locator fixes with a dedicated human approval workflow.
- **Multi-Run Stability Scoring (Bonus)**: Executes consecutive test iterations with synthetic UUID credentials to compute flakiness scores (`Stability: 3/3 passed`).
- **Accessibility Auditing (Bonus)**: Integrated in-browser axe-core testing checking pages against WCAG AA accessibility standards.
- **External Site Checker (`/site-check`)**: Safe, read-only crawler for public URLs reporting status codes, page titles, interactive elements, broken links, accessibility violations, and proposed test scenarios with both Light and Dark modes.

---

## Tools & Technologies Used

- **Runtime & Execution**: Node.js (v22+ recommended for built-in `node:sqlite`), TypeScript, TSX.
- **AI / LLM**: Google Gemini SDK (`@google/genai`), using `gemini-3.8-flash` with automatic fallback to `gemini-3.5-flash`.
- **Browser Automation**: Playwright (`playwright`, `@playwright/test`) with Chromium engine.
- **Database**: Built-in Node.js SQLite (`node:sqlite`) for zero-dependency persistence.
- **Accessibility**: Deque `axe-core` (v4.14+).
- **Validation**: Zod (v4.x runtime schema enforcement).
- **Styling**: Responsive Vanilla CSS design tokens with WCAG AA compliant contrast in both Dark and Light themes.

---

## Setup & Installation from a Fresh Clone

### 1. Prerequisites
- **Node.js**: v22.0.0 or higher (required for built-in `node:sqlite` module support; specified in `package.json` engines)
- **npm**: v10.0.0 or higher
- **Google Gemini API Key**: Obtainable from [Google AI Studio](https://aistudio.google.com/)

### 2. Clone & Install Agent Platform
```bash
git clone <repository_url> agentic-project
cd agentic-project
npm install
npx playwright install chromium
```

### 3. Configure Environment Variables
Copy the example environment file and add your Google Gemini API key:
```bash
cp .env.example .env
```
Edit `.env`:
```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
APP_BASE_URL=http://localhost:3000
```
> **Security Reminder**: `.env` is listed in `.gitignore`. Never commit API keys or credentials to version control.

### 4. Clone and Start the Conduit Demo App
In a separate terminal window, set up and launch the Conduit target application:
```bash
# Clone the open-source Next.js RealWorld Conduit demo app
git clone https://github.com/gutentag2012/realworld-nextjs-trpc-prisma.git conduit-app
cd conduit-app
git checkout 1413fb9cc94409bdb47d904f9895084b050e900c
cp .env.example .env
npm install --legacy-peer-deps
npx prisma generate
npx prisma db push
npm run dev
```
Verify that the Conduit application is live at `http://localhost:3000` and the registration page is accessible at `http://localhost:3000/register`.

### 5. Start the Agent Dashboard
In your primary terminal:
```bash
npm run dashboard
```
Open your browser to:
```
http://localhost:3050
```
*Note: If `agent_data.sqlite` is not present on initial launch, the system automatically initializes the live database from `data/seed.sqlite`.*

---

## Docker Container Deployment (Single Unified Container)

The platform is fully packaged for deployment as a single self-contained Docker container:
- **Base Image**: Official Microsoft Playwright image (`mcr.microsoft.com/playwright:v1.50.0-noble`) with Node.js and all browser automation dependencies pre-installed.
- **Internal Demo App**: Clones and builds Conduit (`https://github.com/gutentag2012/realworld-nextjs-trpc-prisma.git` @ commit `1413fb9cc94409bdb47d904f9895084b050e900c`) at image build time, running strictly on internal `localhost:3000`.
- **Public Dashboard**: Listens on the configured `PORT` environment variable (`0.0.0.0:$PORT`, default `3050`). `APP_BASE_URL` points internally to `http://localhost:3000`.
- **Zero Hardcoded Secrets**: Secrets are NEVER baked into the image. `GEMINI_API_KEY` is read strictly from container environment variables at runtime.
- **Health Check Probe**: Built-in `/health` (and `/api/health`) endpoint returning HTTP 200 with service status, uptime, database connection state, and port.
- **Rate Limiting**: Protects all execution and LLM endpoints with a 15 request/minute per-IP rate limiter (HTTP 429 with `Retry-After`).
- **SSRF Guard**: Strict server-side request forgery protection blocking private IP ranges, link-local metadata addresses, and unauthorized loopback ports while allowlisting internal Conduit.
- **Automatic Seed on Startup**: Automatically initializes SQLite from `data/seed.sqlite` if the database is missing or empty, immediately providing the 4 official benchmark runs and bonus data.

### 1. Build the Docker Image
```bash
docker build -t agentic-playwright-dashboard:latest .
```

### 2. Run the Container
Pass your `GEMINI_API_KEY` as an environment variable at runtime (secrets are never stored in the image):
```bash
docker run -d \
  --name agentic-dashboard \
  -p 3050:3050 \
  -e GEMINI_API_KEY="your_gemini_api_key_here" \
  -e PORT=3050 \
  agentic-playwright-dashboard:latest
```

### 3. Verify Health & Telemetry
Check the container health endpoint:
```bash
curl http://localhost:3050/health
```
Expected response:
```json
{
  "status": "ok",
  "uptimeSeconds": 12,
  "service": "agentic-playwright-dashboard",
  "port": 3050,
  "appBaseUrl": "http://localhost:3000",
  "database": "connected"
}
```

Open your browser at `http://localhost:3050` to access the full agent dashboard.

### 4. Container Logs & Troubleshooting
```bash
# View dashboard and entrypoint logs
docker logs -f agentic-dashboard

# Check container health status
docker inspect --format='{{json .State.Health}}' agentic-dashboard
```

---

## Run in GitHub Codespaces

You can run and evaluate this entire agent platform in a browser using GitHub Codespaces with zero local setup:

### 1. Configure the Gemini API Secret in GitHub
Before creating your Codespace, configure your API key as a secret:
1. Navigate to **GitHub Settings** ➔ **Codespaces** ➔ **Codespaces secrets** (or repository **Settings** ➔ **Secrets and variables** ➔ **Codespaces**).
2. Click **New secret**.
3. Name: `GEMINI_API_KEY`
4. Value: `your_actual_gemini_api_key_here`
5. Select this repository under repository access and save.
> **Security Guarantee**: `GEMINI_API_KEY` is injected strictly via environment variables. It is never committed, baked into images, or logged.

### 2. Launch the Codespace
1. Click the green **Code** button at the top of this repository.
2. Select the **Codespaces** tab.
3. Click **Create codespace on main**.

The automated `.devcontainer/devcontainer.json` environment will build automatically:
- Provisions the official Node 22 Devcontainer (`mcr.microsoft.com/devcontainers/javascript-node:1-22`).
- Runs `npm install` for the agent platform.
- Installs Playwright Chromium with all required Linux OS libraries (`npx playwright install --with-deps chromium`).
- Clones the pinned open-source Conduit demo app (`https://github.com/gutentag2012/realworld-nextjs-trpc-prisma.git` at commit `1413fb9cc94409bdb47d904f9895084b050e900c`), pushes SQLite Prisma migrations, and generates the database client.

### 3. Start Conduit and Dashboard with One Command
In the Codespace terminal:
```bash
npm run codespace:start
```
This orchestrates:
- **Internal Demo App**: Launches Conduit in the background on `localhost:3000` (kept internal, not exposed publicly).
- **Public Dashboard**: Launches the Agent Dashboard on port `3050` once Conduit is ready.

### 4. Access the Dashboard
GitHub Codespaces will display a notification: *"Your application running on port 3050 is available."*
Click **Open in Browser** (or navigate to the **Ports** tab and open port `3050`).
- The health probe is available at `/health`.
- Public security: all endpoints initiating test execution or LLM prompts are guarded by a 15 req/min rate limiter (HTTP 429), and external crawl requests are strictly guarded against SSRF.

### 5. Run Benchmark Tests from Codespace Terminal
You can also run tests or bonus features at any time:
```bash
npm run test:all
npm run bonus
```

---

## Running the 4 Test Cases

You can run the full suite or individual test cases directly from the CLI:

### Run All 4 Benchmark Cases
```bash
npm run test:all
# or
npm test
```

### Run Individual Test Cases
- **TC1: Successful Registration Flow**
  ```bash
  npm run test:tc1
  ```
  *Verifies account creation with unique credentials, authenticated session, and SQLite database record.*

- **TC2: Selector Mutation / Negative Test**
  ```bash
  npm run test:tc2
  ```
  *Simulates a broken button locator (`button.non-existent-btn-class-changed`). Fails deterministically as expected with diagnostics.*

- **TC3: Critic Upgrade Flow**
  ```bash
  npm run test:tc3
  ```
  *Drafts a URL-only check (`Draft 1`), triggers critic rejection, upgrades to navbar user profile link state assertion (`Draft 2`), and passes execution.*

- **TC4: Fresh Synthetic Data & DB Duplicate Account Proof**
  ```bash
  npm run test:tc4
  ```
  *Executes Run 1 and Rerun with unique UUID synthetic credentials. Verifies `SELECT COUNT(*) FROM User WHERE email = ...` returns exactly 1 for each user.*

### Run Bonus Features
```bash
# Run stability 3x calculation and axe-core accessibility audit
npm run bonus

# Approve and execute the TC2 self-healing fix on a separate copy
npm run bonus:heal
```

---

## Safety & Security Rules

The platform enforces strict safety rules in code:

1. **Synthetic Data Only**: All test credentials use UUID-generated usernames (`user_<hex>`) and synthetic emails (`agent_test_<hex>@example.com`). Zero real PII is ever used or stored.
2. **Read-Only External Inspection**: By default, the Site Checker inspects external sites in read-only mode (crawling links, capturing screenshots, harvesting selectors). It never attempts login, signup, or automated form submission on external domains.
3. **Permission & Human Approval Gate**: Running any proposed test scenario that submits a form on external sites requires checking *"I own this site or have permission to test it"* AND an explicit human approval click.
4. **Restricted Protocols & Allowlisting**: Accepts only `http` and `https`. Blocks `localhost`, loopback addresses, private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x), and `file://` (with an explicit allowlist only for the configured demo app `APP_BASE_URL`).
5. **Crawler Safety Limits**: External site checking enforces a maximum of 5 pages, 20 links, a 90-second overall timeout, 1-second polite crawl delays, and respects `robots.txt`.
6. **No CAPTCHA / OTP Bypasses**: Never attempts to bypass CAPTCHA, bot detection, or two-factor authentication. If encountered, execution immediately halts and reports manual intervention required.

---

## Credits & Acknowledgments

- **Conduit (RealWorld)**: The target application under test is based on the open-source [RealWorld Conduit specification](https://github.com/gothinkster/realworld) created by Thinkster and the RealWorld community, demonstrating real-world fullstack patterns.