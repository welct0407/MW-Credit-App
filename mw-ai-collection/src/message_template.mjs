// Format source: Draft daily collection messages, final user instructions,
// task 01a066b1-e885-7d52-98f5-34812d9c7c18 (3 September 2026).
// Bank details are supplied privately only after destination-specific approval.
export function collectionMessage(facts, paymentBlock = '') {
  const amount = value => value.toLocaleString('en-US');
  const lines = [];
  const name = facts.borrowerName.trim();
  const greeting = name.startsWith('พี่') ? `${name}คะ` : name;
  if (facts.todayRemaining > 0) {
    lines.push(`${greeting} วันนี้มียอดที่ต้องส่ง ${amount(facts.todayRemaining)} บาทนะคะ`);
  } else {
    lines.push(`${greeting} วันนี้ไม่มียอดค้างของวันนี้แล้วนะคะ ✅`);
  }
  if (facts.overdueRemaining > 0) {
    lines.push(`📌 และมียอดค้างเดิมอีก ${amount(facts.overdueRemaining)} บาทนะคะ`);
  }
  if (facts.todayRemaining > 0 || facts.overdueRemaining > 0) {
    lines.push('', '⚠️ รบกวนส่งภายใน 16.00 น. เพื่อไม่ให้มีค่าปรับล่าช้านะคะ 💵',
      '⏰ ปรับช้า 16.01 น. เริ่ม 50฿ ปรับทุกชั่วโมง 50฿',
      '📆 หากข้ามวัน ค่าปรับล่าช้ารวมเป็น 500฿',
      '‼️ กรณีปิดต้น รบกวนชำระเงินต้นพร้อมดอกเบี้ยของวันนี้ทุกครั้งนะคะ', '');
  }
  if (paymentBlock.trim()) lines.push('⚠️ แจ้งเตือนการส่งยอด ⚠️', paymentBlock.trim());
  return lines.join('\n');
}
