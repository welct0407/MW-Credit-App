import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { borrowers, dueFor, sampleDate, type Locale, type Borrower } from './fixtures';
import './style.css';
const logoUrl = new URL('./assets/loan-manager-logo.png', import.meta.url).href;
const routes = [
  ['dashboard', 'Dashboard', 'ภาพรวม', '◫'], ['collection', 'Collection', 'ติดตามชำระ', '◷'], ['payments', 'Payments', 'การชำระเงิน', '↗'], ['borrowers', 'Borrowers', 'ผู้กู้', '◎'], ['loans', 'Loans', 'สัญญาเงินกู้', '▤'], ['charges', 'Upcoming Charges', 'ยอดเรียกเก็บถัดไป', '▦'], ['expenses', 'Business Expenses', 'ค่าใช้จ่ายธุรกิจ', '↙'], ['statement', 'Cash Statement', 'รายการเงินสด', '≡'],
  ['partners', 'Partners', 'หุ้นส่วน', '◇'], ['position', 'Cash Position', 'สถานะเงินสด', '◉'], ['accounts', 'Cash Accounts', 'บัญชีเงินสด', '▣'], ['assessment', 'Loan Assessment', 'ประเมินสินเชื่อ', '✓'], ['analytics', 'Analytics / history', 'วิเคราะห์ / ประวัติ', '▥'],
];
function App() {
  // Presentation only: never infer service identity from Vite's build mode.
  const [previewTheme, setPreviewTheme] = useState<'dev' | 'prod'>(() => new URLSearchParams(window.location.search).get('theme') === 'prod' ? 'prod' : 'dev');
  const [locale, setLocale] = useState<Locale>('en');
  const [route, setRoute] = useState('collection');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!menu)
      return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = sidebarRef.current;
    const controls = panel?.querySelectorAll<HTMLElement>('a, button');
    controls?.[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenu(false);
      }
      if (event.key === 'Tab' && controls?.length) {
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
        else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [menu]);
  const t = (en: string, th: string) => locale === 'en' ? en : th;
  const money = (value: number) => new Intl.NumberFormat(locale === 'en' ? 'en-TH' : 'th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(value);
  const date = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date(value + 'T00:00:00Z'));
  const go = (next: string) => { setRoute(next); setQuery(''); setFilter('all'); setSelected(null); setMenu(false); };
  const functional = route === 'collection' || route === 'borrowers';
  const base = route === 'collection' ? borrowers.filter(b => dueFor(b) > 0) : borrowers;
  const visible = base.filter(b => (b.name.en + ' ' + b.name.th + ' ' + b.id).toLowerCase().includes(query.toLowerCase().trim()) && (filter === 'all' || (filter === 'active' ? b.loans.length > 0 : filter === 'inactive' ? b.loans.length === 0 : b.status === filter)));
  const current = visible.find(b => b.id === selected);
  const dueTotal = borrowers.reduce((s, b) => s + dueFor(b), 0);
  const dueCount = borrowers.filter(b => dueFor(b) > 0).length;
  const routeInfo = routes.find(r => r[0] === route)!;
  const status = (b: Borrower) => b.status === 'overdue' ? t('Overdue', 'เลยกำหนด') : b.status === 'due' ? t('Due today', 'ถึงกำหนดวันนี้') : t('Nothing due', 'ไม่มียอดถึงกำหนด');
  const renderCard = (b: Borrower) => <button key={b.id} className={'borrower-card ' + (current?.id === b.id ? 'selected' : '')} onClick={() => setSelected(b.id)} aria-pressed={current?.id === b.id} data-testid={'borrower-' + b.id}>
    <span className="avatar">
      {b.initials}
    </span>
    <span className="person">
      <strong>
        {b.name[locale]}
      </strong>
      <span>
        {b.id} · {b.area[locale]}
      </span>
      <span className={'status ' + b.status}>
        {status(b)}
      </span>
    </span>
    <span className="card-amount">
      <strong>
        {money(route === 'collection' ? dueFor(b) : b.principal)}
      </strong>
      <span>
        {route === 'collection' ? t('Amount due', 'ยอดถึงกำหนด') : t('Principal outstanding', 'เงินต้นคงเหลือ')}
      </span>
      <span className="arrow">↗</span>
    </span>
  </button>;
  return <div className="app-shell" data-preview-theme={previewTheme}>
    <aside ref={sidebarRef} className={'sidebar ' + (menu ? 'open' : '')}>
      <a className="brand" href="#" onClick={e => { e.preventDefault(); go('collection'); }}>
        <img className="brand-logo" src={logoUrl} alt="Loan Manager" />
        <span>MW Credit<small>
          {t('WORKSPACE PREVIEW', 'ตัวอย่างพื้นที่ทำงาน')}
        </small>
        </span>
      </a>
      <div className="nav-caption">
        {t('OPERATIONS', 'งานปฏิบัติการ')}
      </div>
      <nav aria-label={t('Main navigation', 'เมนูหลัก')}>
        {routes.map((r, i) => <React.Fragment key={r[0]}>
          {i === 8 && <div className="nav-caption management">
            {t('MANAGEMENT', 'งานบริหาร')}
          </div>}
          <button className={'nav-item ' + (route === r[0] ? 'active' : '')} onClick={() => go(r[0])} aria-current={route === r[0] ? 'page' : undefined}>
            <span className="nav-icon" aria-hidden="true">
              {r[3]}
            </span>
            {r[locale === 'en' ? 1 : 2]}{r[0] !== 'collection' && r[0] !== 'borrowers' && <span className="planned-dot" title={t('Planned', 'อยู่ในแผน')}>·</span>}
          </button>
        </React.Fragment>)}
      </nav>
      <div className="sidebar-foot">
        <span className="outline-dot" />
        {t('AppSheet continues in parallel', 'AppSheet ยังคงใช้งานควบคู่')}
        <small>
          {t('Preview only. No live connection.', 'ตัวอย่างเท่านั้น ไม่มีการเชื่อมต่อข้อมูลจริง')}
        </small>
      </div>
    </aside>
    {menu && <button className="menu-scrim" aria-label={t('Close navigation', 'ปิดเมนู')} onClick={() => setMenu(false)} />}
    <div className="workspace" inert={menu}>
      <header className="topbar">
        <button className="menu-toggle" aria-expanded={menu} aria-label={t('Open navigation', 'เปิดเมนู')} onClick={() => setMenu(!menu)}>☰</button>
        <div className="breadcrumb">
          {t('Workspace', 'พื้นที่ทำงาน')}
          <span>/</span>
          <strong>
            {routeInfo[locale === 'en' ? 1 : 2]}
          </strong>
        </div>
        <div className="language" role="group" aria-label="Language">
          <button onClick={() => { setLocale('en'); document.documentElement.lang = 'en'; }} aria-pressed={locale === 'en'}>EN</button>
          <button onClick={() => { setLocale('th'); document.documentElement.lang = 'th'; }} aria-pressed={locale === 'th'}>ไทย</button>
        </div>
      </header>
      <main>
        <div className="theme-preview" role="group" aria-label={t('Theme preview', 'ตัวอย่างสี')}>
          <span>{t('Colors only · no environment change', 'ตัวอย่างสีเท่านั้น · ไม่เปลี่ยนระบบ')}</span>
          <button aria-pressed={previewTheme === 'dev'} onClick={() => setPreviewTheme('dev')}>DEV</button>
          <button aria-pressed={previewTheme === 'prod'} onClick={() => setPreviewTheme('prod')}>PROD</button>
        </div>
        <div className="preview-strip">
          <span className="preview-dot" />
          {t('Design preview · synthetic data', 'ตัวอย่างการออกแบบ · ข้อมูลสมมติ')}
          <span className="preview-detail">
            {t('No live customer data or financial actions', 'ไม่มีข้อมูลลูกค้าจริงหรือการทำรายการทางการเงิน')}
          </span>
        </div>
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              {t('MW CREDIT / OPERATIONS PREVIEW', 'MW CREDIT / ตัวอย่างระบบ')}
            </div>
            <h1>
              {routeInfo[locale === 'en' ? 1 : 2]}
            </h1>
            <p>
              {route === 'collection' ? t('A clear view of who needs your attention.', 'ดูรายการที่ต้องติดตามได้อย่างชัดเจน') : route === 'borrowers' ? t('People, active loans, and the context you need.', 'ผู้กู้ สัญญาที่ใช้งาน และข้อมูลประกอบที่จำเป็น') : t('A place for the next part of your workflow.', 'พื้นที่สำหรับขั้นตอนถัดไปของงาน')}
            </p>
          </div>
          <div className="sample-date">
            <span>
              {t('Sample business date', 'วันที่ทำการตัวอย่าง')}
            </span>
            <strong>
              {date(sampleDate)}
            </strong>
          </div>
        </div>
        {functional ? <>
          <section className="metrics" aria-label={t('Sample summary', 'สรุปข้อมูลตัวอย่าง')}>
            <div className="metric">
              <span>
                {t('Total due · sample portfolio', 'ยอดถึงกำหนดรวม · ชุดข้อมูลตัวอย่าง')}
              </span>
              <strong data-testid="total-due">
                {money(dueTotal)}
              </strong>
              <small>
                {t('Includes overdue and today’s charges', 'รวมยอดเลยกำหนดและยอดวันนี้')}
              </small>
            </div>
            <div className="metric">
              <span>
                {t('Borrowers to follow up', 'ผู้กู้ที่ต้องติดตาม')}
              </span>
              <strong>
                {dueCount.toString().padStart(2, '0')}
                <small>
                  {t(' borrowers', ' คน')}
                </small>
              </strong>
              <small>
                {t('Derived from the sample charges', 'คำนวณจากรายการเรียกเก็บตัวอย่าง')}
              </small>
            </div>
</section>
          <div className={'work-grid ' + (current ? 'has-detail' : '')}>
            <section className="list-panel">
              <div className="section-heading">
                <div>
                  <h2>
                    {route === 'collection' ? t('Follow-up list', 'รายการติดตาม') : t('Borrower directory', 'รายชื่อผู้กู้')}
                  </h2>
                  <span>
                    {visible.length} {t('sample borrowers', 'ผู้กู้ตัวอย่าง')}
                  </span>
                </div>
                <span className="section-symbol" aria-hidden="true">◎</span>
              </div>
              <div className="filters">
                <label className="search">
                  <span aria-hidden="true">⌕</span>
                  <input aria-label={t('Search borrowers', 'ค้นหาผู้กู้')} placeholder={t('Search name or sample ID', 'ค้นหาชื่อหรือรหัสตัวอย่าง')} value={query} onChange={e => { setQuery(e.target.value); setSelected(null); }} />
                </label>
                <label className="filter-label">
                  <span className="sr-only">
                    {t('Filter borrowers', 'กรองผู้กู้')}
                  </span>
                  <select value={filter} onChange={e => { setFilter(e.target.value); setSelected(null); }}>
                    {(route === 'collection' ? [['all', 'All statuses', 'ทุกสถานะ'], ['due', 'Due today', 'ถึงกำหนดวันนี้'], ['overdue', 'Overdue', 'เลยกำหนด']] : [['all', 'All borrowers', 'ผู้กู้ทั้งหมด'], ['active', 'Active loans', 'มีสัญญาที่ใช้งาน'], ['inactive', 'No active loan', 'ไม่มีสัญญาที่ใช้งาน']]).map(o => <option key={o[0]} value={o[0]}>
                      {o[locale === 'en' ? 1 : 2]}
                    </option>)}
                  </select>
                </label>
              </div>
              <div className="borrower-list">
                {visible.length === 0 ? <div className="empty-state">
                  <span>⌕</span>
                  <h3>
                    {t('No matching borrowers', 'ไม่พบผู้กู้ที่ตรงกัน')}
                  </h3>
                  <p>
                    {t('Try another name or reset your filters.', 'ลองชื่ออื่นหรือล้างตัวกรอง')}
                  </p>
                  <button className="secondary-button" onClick={() => { setQuery(''); setFilter('all'); }}>
                    {t('Reset filters', 'ล้างตัวกรอง')}
                  </button>
                </div> : route === 'borrowers' ? <>
                  {[true, false].map(active => {
                    const group = visible.filter(b => (b.loans.length > 0) === active); return group.length > 0 && <div key={String(active)}>
                      <h3 className="group-label">
                        {active ? t('Active loans', 'มีสัญญาที่ใช้งาน') : t('No active loan', 'ไม่มีสัญญาที่ใช้งาน')}
                        <span>
                          {group.length}
                        </span>
                      </h3>
                      {group.map(renderCard)}
                    </div>;
                  })}
                </> : visible.map(renderCard)}
              </div>
              <div className="list-foot">
                {t('Fictional records for design review only.', 'ข้อมูลสมมติสำหรับตรวจสอบการออกแบบเท่านั้น')}
              </div>
            </section>
            <section className={'detail-panel ' + (!current ? 'unselected' : '')} aria-label={t('Borrower details', 'รายละเอียดผู้กู้')}>
              {current ? <>
                <button className="back-button" onClick={() => setSelected(null)}>← {t('Back to list', 'กลับไปรายการ')}
                </button>
                <div className="detail-heading">
                  <span className="avatar large">
                    {current.initials}
                  </span>
                  <span className={'status ' + current.status}>
                    {status(current)}
                  </span>
                </div>
                <h2>
                  {current.name[locale]}
                </h2>
                <p className="detail-id">
                  {current.id} · {current.area[locale]}
                </p>
                <div className="detail-amounts">
                  <div>
                    <span>
                      {t('Amount due', 'ยอดถึงกำหนด')}
                    </span>
                    <strong>
                      {money(dueFor(current))}
                    </strong>
                  </div>
                  <div>
                    <span>
                      {t('Principal outstanding', 'เงินต้นคงเหลือ')}
                    </span>
                    <strong>
                      {money(current.principal)}
                    </strong>
                  </div>
                </div>
                {current.note && <div className={'issue-note ' + (current.status === 'overdue' ? 'attention' : '')}>
                  <strong>
                    {t('Follow-up note', 'หมายเหตุการติดตาม')}
                  </strong>
                  <p>
                    {current.note[locale]}
                  </p>
                </div>}
                <h3 className="detail-section-title">
                  {t('Related loans & charges', 'สัญญาและยอดเรียกเก็บที่เกี่ยวข้อง')}
                  <span>
                    {current.loans.length}
                  </span>
                </h3>
                {current.loans.length === 0 ? <p className="muted">
                  {t('No active sample loans.', 'ไม่มีสัญญาตัวอย่างที่ใช้งาน')}
                </p> : current.loans.map(loan => <article className="loan" key={loan.id}>
                  <div className="loan-title">
                    <strong>
                      {loan.id}
                    </strong>
                    <span>
                      {t('Sample loan', 'สัญญาตัวอย่าง')}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>
                        {t('Principal outstanding', 'เงินต้นคงเหลือ')}
                      </dt>
                      <dd>
                        {money(loan.principal)}
                      </dd>
                    </div>
                    {loan.charges.map((charge, i) => <div key={i}>
                      <dt>
                        {charge.label[locale]}
                        <small>
                          {date(charge.date)}
                        </small>
                      </dt>
                      <dd>
                        {money(charge.amount)}
                      </dd>
                    </div>)}
                    <div>
                      <dt>
                        {t('Next scheduled date', 'กำหนดถัดไป')}
                      </dt>
                      <dd>
                        {date(loan.nextDate)}
                      </dd>
                    </div>
                  </dl>
                </article>)}
                <div className="receipt">
                  <span aria-hidden="true">▧</span>
                  <div>
                    <strong>
                      {t('Receipt preview', 'ตัวอย่างใบเสร็จ')}
                    </strong>
                    <p>
                      {t('No receipt attached. Placeholder only.', 'ไม่มีใบเสร็จแนบ เป็นพื้นที่ตัวอย่างเท่านั้น')}
                    </p>
                  </div>
                </div>
                <button className="post-button" disabled>
                  {t('Record payment · planned', 'บันทึกการชำระ · อยู่ในแผน')}
                </button>
                <p className="action-note">
                  {t('Payment posting and online confirmation are not available in this preview.', 'ตัวอย่างนี้ยังไม่รองรับการบันทึกการชำระหรือยืนยันรายการออนไลน์')}
                </p>
              </> : <div className="detail-empty">
                <span className="detail-illustration">◎<i>↗</i>
                </span>
                <h2>
                  {t('The details, in one place', 'รายละเอียดในที่เดียว')}
                </h2>
                <p>
                  {t('Select a borrower to see sample loans, charges, and follow-up context.', 'เลือกผู้กู้เพื่อดูสัญญาตัวอย่าง ยอดเรียกเก็บ และข้อมูลติดตาม')}
                </p>
                <div>
                  {t('Select a borrower to begin', 'เลือกผู้กู้เพื่อเริ่มต้น')} <span>→</span>
                </div>
              </div>}
            </section>
          </div>
        </> : <section className="planned-panel">
          <span className="planned-icon" aria-hidden="true">
            {routeInfo[3]}
          </span>
          <div className="eyebrow">
            {t('PLANNED WORKFLOW', 'ขั้นตอนที่อยู่ในแผน')}
          </div>
          <h2>
            {t('This workspace is taking shape.', 'กำลังออกแบบพื้นที่ทำงานนี้')}
          </h2>
          <p>
            {t('Collection and Borrowers are ready to explore in this design checkpoint. This section has no live data or actions.', 'จุดตรวจสอบนี้สามารถทดลองหน้าติดตามชำระและผู้กู้ได้ ส่วนนี้ยังไม่มีข้อมูลจริงหรือการทำรายการ')}
          </p>
          {route === 'analytics' ? <p>
            {t('Native analytics, history, and assessment controls remain planned before production go-live. Existing reports remain in their current tools. Metabase integration follows production go-live.', 'การวิเคราะห์ ประวัติ และการประเมินภายในแอปยังอยู่ในแผนก่อนเปิดใช้งานจริง รายงานเดิมยังอยู่ในเครื่องมือปัจจุบัน การเชื่อมต่อ Metabase จะดำเนินการหลังเปิดใช้งานจริง')}
          </p> : routes.findIndex(r => r[0] === route) >= 8 && <p>
            {t('Native management workflows remain planned before production go-live.', 'งานบริหารภายในแอปยังอยู่ในแผนก่อนเปิดใช้งานจริง')}
          </p>}
          <button className="secondary-button" onClick={() => go('collection')}>
            {t('Explore Collection', 'ทดลองหน้าติดตามชำระ')} →</button>
        </section>}
        <footer className="page-footer">
          <span>MW CREDIT</span>
          {t('Design checkpoint 01 · Local, synthetic preview', 'จุดตรวจสอบการออกแบบ 01 · ตัวอย่างข้อมูลสมมติในเครื่อง')}
        </footer>
      </main>
      <nav className="mobile-nav" aria-label={t('Quick navigation', 'เมนูลัด')}>
        <button aria-current={route === 'collection' ? 'page' : undefined} onClick={() => go('collection')}>
          <span>◷</span>
          {t('Collection', 'ติดตามชำระ')}
        </button>
        <button aria-current={route === 'borrowers' ? 'page' : undefined} onClick={() => go('borrowers')}>
          <span>◎</span>
          {t('Borrowers', 'ผู้กู้')}
        </button>
        <button onClick={() => setMenu(!menu)}>
          <span>☰</span>
          {t('More', 'เพิ่มเติม')}
        </button>
      </nav>
    </div>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App />);
