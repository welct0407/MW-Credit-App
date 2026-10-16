/** APP-UX-SETTINGS-01: what a failed Google sign-in tells the user; "Continue with Google" stays the retry.
 * Firebase gives no request reference, so only the error code is shown for unexpected failures. */
export function signInFailureMessage(code:string|undefined,thai:boolean):{text:string;code?:string}{
 if(code==='auth/popup-blocked'||code==='auth/popup-closed-by-user'||code==='auth/cancelled-popup-request')return {text:thai?'หน้าต่างลงชื่อเข้าใช้ถูกปิดหรือถูกบล็อก โปรดอนุญาตป๊อปอัปสำหรับเว็บไซต์นี้แล้วลองอีกครั้ง':'The sign-in window was closed or blocked. Allow pop-ups for this site and try again.'};
 if(code==='auth/network-request-failed')return {text:thai?'การลงชื่อเข้าใช้ต้องเชื่อมต่ออินเทอร์เน็ต ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง':'Sign-in needs a connection. Check the connection and try again.'};
 return {text:thai?'ลงชื่อเข้าใช้ไม่สำเร็จ กรุณาลองอีกครั้ง':'Sign-in did not complete. Try again.',...(code?{code}:{})};
}
