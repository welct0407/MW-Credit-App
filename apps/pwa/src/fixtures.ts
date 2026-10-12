export type Locale = 'en' | 'th';
export type Borrower = {
    id: string;
    name: Record<Locale, string>;
    initials: string;
    area: Record<Locale, string>;
    principal: number;
    status: 'due' | 'overdue' | 'clear';
    note?: Record<Locale, string>;
    loans: {
        id: string;
        principal: number;
        charges: {
            id: string;
            label: Record<Locale, string>;
            amount: number;
            date: string;
        }[];
        nextDate: string;
    }[];
};
export const sampleDate = '2026-10-07';
export const borrowers: Borrower[] = [
    { id: 'SAMPLE-001', name: { en: 'Mali · Sample', th: 'มะลิ · ตัวอย่าง' }, initials: 'ML', area: { en: 'North district', th: 'เขตเหนือ' }, principal: 24000, status: 'due', loans: [{ id: 'DEMO-L001', principal: 24000, charges: [{ id: 'DEMO-C001', label: { en: 'Scheduled instalment', th: 'ค่างวดตามกำหนด' }, amount: 1200, date: '2026-10-07' }], nextDate: '2026-10-14' }] },
    { id: 'SAMPLE-002', name: { en: 'Somchai · Sample', th: 'สมชาย · ตัวอย่าง' }, initials: 'SC', area: { en: 'Central district', th: 'เขตกลาง' }, principal: 36000, status: 'overdue', note: { en: 'Sample issue: follow up on a missed instalment.', th: 'ปัญหาตัวอย่าง: ติดตามค่างวดที่เลยกำหนด' }, loans: [{ id: 'DEMO-L002', principal: 20000, charges: [{ id: 'DEMO-C002', label: { en: 'Missed instalment', th: 'ค่างวดที่เลยกำหนด' }, amount: 1500, date: '2026-10-05' }], nextDate: '2026-10-12' }, { id: 'DEMO-L003', principal: 16000, charges: [{ id: 'DEMO-C003', label: { en: 'Scheduled instalment', th: 'ค่างวดตามกำหนด' }, amount: 800, date: '2026-10-07' }], nextDate: '2026-10-14' }] },
    { id: 'SAMPLE-003', name: { en: 'Nida · Sample', th: 'นิดา · ตัวอย่าง' }, initials: 'ND', area: { en: 'East district', th: 'เขตตะวันออก' }, principal: 18000, status: 'due', note: { en: 'Sample note: prefers an afternoon visit.', th: 'หมายเหตุตัวอย่าง: สะดวกให้เข้าพบช่วงบ่าย' }, loans: [{ id: 'DEMO-L004', principal: 18000, charges: [{ id: 'DEMO-C004', label: { en: 'Scheduled instalment', th: 'ค่างวดตามกำหนด' }, amount: 900, date: '2026-10-07' }], nextDate: '2026-10-14' }] },
    { id: 'SAMPLE-004', name: { en: 'Arun · Sample', th: 'อรุณ · ตัวอย่าง' }, initials: 'AR', area: { en: 'West district', th: 'เขตตะวันตก' }, principal: 12000, status: 'clear', loans: [{ id: 'DEMO-L005', principal: 12000, charges: [], nextDate: '2026-10-16' }] },
    { id: 'SAMPLE-005', name: { en: 'Pim · Sample', th: 'พิม · ตัวอย่าง' }, initials: 'PM', area: { en: 'Central district', th: 'เขตกลาง' }, principal: 0, status: 'clear', loans: [] },
];
export const dueFor = (borrower: Borrower) => borrower.loans.reduce((total, loan) => total + loan.charges.filter(charge => charge.date <= sampleDate).reduce((sum, charge) => sum + charge.amount, 0), 0);
