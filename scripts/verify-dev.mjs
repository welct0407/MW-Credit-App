import { GoogleAuth } from "google-auth-library";

const url = "https://mw-credit-app-api-dev-pvrgvyg3oq-as.a.run.app";
const account = "mw-credit-app-deploy@clever-oasis-508610-n7.iam.gserviceaccount.com";
const accessToken = await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getAccessToken();
if (!accessToken) throw new Error("Google authentication unavailable");
const minted = await fetch("https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" + account + ":generateIdToken", {
  method: "POST",
  headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
  body: JSON.stringify({ audience: url, includeEmail: true }),
});
if (!minted.ok) throw new Error("ID token request failed: HTTP " + minted.status);
const { token } = await minted.json();
if (!token) throw new Error("ID token missing");
const response = await fetch(url + "/readyz", { headers: { Authorization: "Bearer " + token } });
if (!response.ok) throw new Error("Readiness failed: HTTP " + response.status);
const result = await response.json();
if (result.status !== "ready" || result.environment !== "dev" || result.database !== "connected" || result.storage !== "verified" || result.secrets !== "verified") throw new Error("Unexpected readiness result");
console.log(JSON.stringify(result));
