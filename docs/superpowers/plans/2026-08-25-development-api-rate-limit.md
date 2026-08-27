# Development API Rate Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disable the 3001 global API rate limiter during development while retaining the existing production limit.

**Architecture:** Keep the existing `express-rate-limit` configuration intact and mount it only when `NODE_ENV=production`. Document the behavior beside `NODE_ENV=development` in the existing environment template.

**Tech Stack:** Node.js, Express, express-rate-limit, dotenv

## Global Constraints

- Modify only `backend_impl/src/index.js` and `backend_impl/.env.example` runtime behavior/documentation.
- Do not modify frontend, MongoDB, SQLite, 5001 Python, or business routes.
- Do not restart or stop the user's currently running 3001 process during verification.
- Use a temporary port and real HTTP requests for verification; no new automated test file is required for this configuration-only change.

---

### Task 1: Make rate limiting production-only

**Files:**
- Modify: `backend_impl/src/index.js:45-51`
- Modify: `backend_impl/.env.example`

**Interfaces:**
- Consumes: `process.env.NODE_ENV`
- Produces: development API requests without rate limiting; production requests with the existing 100 requests per 15 minutes limiter

- [ ] **Step 1: Confirm the current limiter is mounted unconditionally**

Run: `rg -n -C 5 "apiLimiter|app.use\('/api/'" backend_impl/src/index.js`

Expected: `app.use('/api/', apiLimiter)` is unconditional.

- [ ] **Step 2: Mount the existing limiter only in production**

Change the mount to:

```js
if (process.env.NODE_ENV === 'production') {
  app.use('/api/', apiLimiter);
}
```

- [ ] **Step 3: Document the environment behavior**

Add comments immediately above `NODE_ENV=development` in `backend_impl/.env.example` explaining:

```dotenv
# development: API 不限流，便于本地联调
# production: 启用 /api/* 限流（每 IP 15 分钟最多 100 次请求）
NODE_ENV=development
```

- [ ] **Step 4: Verify development behavior on a temporary port**

Start the backend with `NODE_ENV=development` and a temporary port, then request an existing `/api/*` endpoint at least 101 times.

Expected: no response has HTTP status 429, and the temporary process is stopped afterward without touching port 3001.

- [ ] **Step 5: Review the focused diff**

Run: `git diff -- backend_impl/src/index.js backend_impl/.env.example`

Expected: only the conditional mount and environment-template comments are introduced by this task; unrelated pre-existing `.env.example` edits remain intact.

