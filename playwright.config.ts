import {defineConfig,devices} from "@playwright/test";
// CI: one retry with a trace from the retry so a timing failure is diagnosable
// from the uploaded artifact instead of a re-run; Playwright reports a pass on
// retry as "flaky" so the test still shows up for repair. Local runs keep zero
// retries so a racy test fails loudly while it is being written.
const ci=!!process.env.CI;
// Cloud sessions route Chromium through a sandbox proxy that ignores the
// --host-resolver-rules mapping the live-shell fixtures rely on, so the real
// DEV site loads instead of the local fixture. Bypassing the proxy for the app
// origins restores the mapping; no-op where no proxy is configured.
if(process.env.HTTPS_PROXY||process.env.https_proxy){for(const k of["NO_PROXY","no_proxy"]){const have=(process.env[k]||"").split(",").filter(Boolean);for(const h of["dev-lm.mw-credit.com","lm.mw-credit.com",".web.app",".run.app"])if(!have.includes(h))have.push(h);process.env[k]=have.join(",")}}
// iPad in WebKit. Supported iPads (iPad 11th gen, iPad Air 5th gen and later at
// 11 and 13 inches, iPad Pro M5 11 and 13 inches) are 820-1032 CSS pixels wide
// in portrait and 1180-1376 in landscape, at 2x. Two profiles cover the layouts
// they reach that no other project does: an 820x1180 portrait screen (the
// 768-1050 tablet layout every iPad shows in portrait) and a 1180x820 landscape
// screen (the 1051-1199 compact desktop layout of the iPad 11 and iPad Air 11");
// 1200 px and wider is the desktop layout of desktop-chromium. Those are the
// screen sizes; each viewport is 74 px shorter (820x1106 and 1180x746), the
// Safari tab under the status and address bars. Playwright's own iPad profiles
// do not match these devices. iPad Safari sends the Mac user agent by default
// and is told apart by its touch points.
const ipadSafari="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Safari/605.1.15";
const ipad=(width:number,height:number)=>({browserName:"webkit" as const,userAgent:ipadSafari,viewport:{width,height:height-74},screen:{width,height},deviceScaleFactor:2,isMobile:true,hasTouch:true});
export default defineConfig({reporter:ci?[["list"],["html",{open:"never"}]]:undefined,retries:ci?1:0,testDir:"tests/e2e",use:{baseURL:"http://127.0.0.1:4173",trace:"on-first-retry"},webServer:{command:"npm run dev -- --port 4173",url:"http://127.0.0.1:4173",reuseExistingServer:!ci},projects:[{name:"desktop-chromium",use:{...devices["Desktop Chrome"]}},{name:"mobile-chromium",use:{...devices["Pixel 7"]}},...(process.env.PLAYWRIGHT_WEBKIT==='1'?[{name:"mobile-webkit",use:{...devices["iPhone 17 Pro Max"]}},{name:"tablet-webkit-portrait",use:ipad(820,1180)},{name:"tablet-webkit-landscape",use:ipad(1180,820)}]:[])]});
