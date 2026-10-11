import { initializeApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, browserPopupRedirectResolver, onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';
import config from 'virtual:production-shell-config';
import { createShellController } from './controller.mjs';
const root=document.querySelector('main');
root.innerHTML='<h1>MW Credit — Production foundation</h1><p id="status" role="status"></p><button id="signin">Sign in with Google</button><button id="signout" hidden>Sign out</button><button id="check" hidden>Check foundation access</button><p>No business features are enabled.</p>';
const status=document.querySelector('#status'),signin=document.querySelector('#signin'),signout=document.querySelector('#signout'),check=document.querySelector('#check');
const controller=createShellController(config,{initializeApp,initializeAuth,inMemoryPersistence,browserPopupRedirectResolver,onAuthStateChanged,signInWithPopup,signOut,GoogleAuthProvider},state=>{
  status.textContent=state.status;signin.hidden=state.signedIn;signout.hidden=!state.signedIn;check.hidden=config.phase!=='foundation'||!state.signedIn;check.disabled=!state.canCheck;
});
signin.onclick=()=>void controller.signIn();signout.onclick=()=>void controller.signOut();check.onclick=()=>void controller.checkAccess();
