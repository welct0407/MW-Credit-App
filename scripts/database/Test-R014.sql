-- Synthetic numerical cases for the owner-defined oldest-month-first contract.
DO $$ BEGIN
 ASSERT public.fifo_current_month_settled(800,500,0)=0,'No withdrawals';
 ASSERT public.fifo_current_month_settled(800,500,600)=0,'Prior months remain unpaid';
 ASSERT public.fifo_current_month_settled(800,500,800)=0,'Exact prior-month boundary';
 ASSERT public.fifo_current_month_settled(800,500,1050)=250,'Withdrawal crosses into current month';
 ASSERT public.fifo_current_month_settled(800,500,1300)=500,'Full settlement';
 ASSERT public.fifo_current_month_settled(800,500,1500)=500,'Never allocate more than current profit';
 ASSERT public.fifo_current_month_settled(0,500,125)=125,'First business month partial settlement';
 ASSERT public.fifo_current_month_settled(-100,500,125)=125,'Prior losses do not become an unpaid positive bucket';
 ASSERT public.fifo_current_month_settled(800,-50,900)=0,'Loss month has no positive withdrawal allocation';
 ASSERT public.fifo_current_month_settled(800,500,1050)-public.fifo_current_month_settled(800,500,900)=150,'Additional partial settlement consumes only incremental profit';
 ASSERT public.fifo_current_month_settled(800,500,900)=100,'Cancelled withdrawal restores allocation';
 ASSERT public.fifo_current_month_settled(800,500,1050)+public.fifo_current_month_settled(400,300,500)=350,'Partners allocate independently';
 ASSERT EXISTS(SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='Cash Dashboard' AND is_updatable='NO'),'Dashboard is read-only';
END $$;
