// DEV live build (`npm run build:live-dev`) labelled with the Open release of project/Documents/Release_Tracker.md,
// so DEV About names the release in development. An explicit MW_RELEASE_NUMBER wins; vite.config.ts validates it.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('..',import.meta.url));
/** The release in the tracker's "New product work | **R075 — Open**" row. */
export function openRelease(tracker){
 const found=tracker.match(/^\|\s*New product work\s*\|\s*\*\*(R\d{3}) — Open\*\*\s*\|[ \t]*\r?$/m)?.[1];
 if(!found)throw Error('Release tracker has no Open release row');
 return found;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.env.MW_RELEASE_NUMBER??=openRelease(readFileSync(path.join(root,'project/Documents/Release_Tracker.md'),'utf8'));
 console.log('MW_RELEASE_NUMBER='+process.env.MW_RELEASE_NUMBER);
 const {build}=await import('vite');
 await build({root,configFile:path.join(root,'vite.config.ts'),mode:'live-dev'});
}
