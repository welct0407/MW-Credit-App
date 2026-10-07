-- R051: actual DEV repeated CRUD selected a generic date-range plan whose
-- estimated cost was 2,956,738 versus 93,406 for the same ten-day custom plan.
-- Keep the complete existing snapshot calculation and its atomic write intact.
-- This setting is scoped/restored by PostgreSQL on function entry/exit; it is
-- not an instance setting or a change to callers' transaction configuration.
ALTER FUNCTION public.refresh_daily_analytics(date,date)
 SET plan_cache_mode = force_custom_plan;
