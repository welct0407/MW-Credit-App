import {defineConfig,devices} from "@playwright/test";
// CI: one retry with a trace from the retry so a timing failure is diagnosable
// from the uploaded artifact instead of a re-run; Playwright reports a pass on
// retry as "flaky" so the test still shows up for repair. Local runs keep zero
// retries so a racy test fails loudly while it is being written.
const ci=!!process.env.CI;
export default defineConfig({reporter:ci?[["list"],["html",{open:"never"}]]:undefined,retries:ci?1:0,testDir:"tests/e2e",use:{baseURL:"http://127.0.0.1:4173",trace:"on-first-retry"},webServer:{command:"npm run dev -- --port 4173",url:"http://127.0.0.1:4173",reuseExistingServer:!ci},projects:[{name:"desktop-chromium",use:{...devices["Desktop Chrome"]}},{name:"mobile-chromium",use:{...devices["Pixel 7"]}},...(process.env.PLAYWRIGHT_WEBKIT==='1'?[{name:"mobile-webkit",use:{...devices["iPhone 13 Pro Max"],browserName:"webkit" as const}}]:[])]});
