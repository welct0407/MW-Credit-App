export type NotificationStatus={enabled:boolean;deviceRegistered:boolean;subscriptionId:string|null};
/** APP-UX-SETTINGS-03: the one state line shown when Notifications opens; reading it never prompts or subscribes. */
export function notificationStatusLine(permission:string|undefined,status:NotificationStatus|null,checking:boolean,thai:boolean):string|null{
 if(permission==='denied')return thai?'เบราว์เซอร์นี้บล็อกการแจ้งเตือน โปรดอนุญาตในการตั้งค่าเว็บไซต์':'Blocked by this browser. Allow notifications in site settings.';
 if(status)return status.enabled?status.deviceRegistered?(thai?'เปิดอยู่บนอุปกรณ์นี้':'On for this device.'):(thai?'เปิดสำหรับบัญชีของคุณ แต่ยังไม่เปิดบนอุปกรณ์นี้':'On for your account, not on this device.'):(thai?'ปิดสำหรับบัญชีของคุณ':'Off for your account.');
 return checking?(thai?'กำลังตรวจสอบสถานะการแจ้งเตือน…':'Checking notification status…'):null;
}
