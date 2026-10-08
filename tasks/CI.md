# CI and test commands

The `CI` workflow runs on pull requests and pushes to `main`. Its web job installs the locked npm dependencies and runs type checking, ESLint, Vitest, Playwright Chromium smoke tests, and the production build. Its native job runs rustfmt, Clippy with warnings denied, and locked Rust tests on Windows and Linux.

The Pages deployment workflow calls the same CI workflow before building and deploying the site.

Local commands:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run build

cd src-tauri
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
```

ESLint and TypeScript checks are separate commands. TypeScript's `noImplicitOverride` is enabled; enabling full strict mode and unchecked-index checks remains incremental because the existing application and tests contain outstanding diagnostics in those modes.
