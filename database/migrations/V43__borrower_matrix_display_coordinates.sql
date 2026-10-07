-- R029: display-only normalization. V3 remains the categorization authority.
-- No AppSheet source, operational column, financial record or rating is changed.
CREATE VIEW public.reporting_borrower_matrix_plot_v1 AS
WITH inputs AS (
 SELECT m.*,
  CASE WHEN quadrant='Unclassified' THEN 'Unclassified'
   WHEN quadrant NOT IN ('Star','Cash Cow','Question Mark','Dog')
     OR reliability_score IS NULL OR reliability_score NOT BETWEEN 0 AND 100
     OR relative_contribution IS NULL
     OR relative_contribution::text IN ('NaN','Infinity','-Infinity')
     OR arrangement_gate IS NULL THEN 'Invalid plot input'
   WHEN (quadrant IN ('Star','Cash Cow')) <> (reliability_score>=80 AND NOT arrangement_gate)
     OR (quadrant IN ('Star','Question Mark')) <> (relative_contribution>=1)
     THEN 'Invalid plot input'
   ELSE 'Plotted' END plot_status
 FROM public.reporting_borrower_matrix_v3 m
), coordinates AS (
 SELECT i.*,
  CASE WHEN plot_status='Plotted' THEN
   CASE WHEN arrangement_gate THEN 75::numeric
    WHEN reliability_score<80 THEN 100-50*reliability_score/80
    ELSE 50-50*(reliability_score-80)/20 END END matrix_x,
  CASE WHEN plot_status='Plotted' THEN
   CASE WHEN relative_contribution<0 THEN 0::numeric
    ELSE 100*relative_contribution/(1+relative_contribution) END END matrix_y
 FROM inputs i
)
SELECT c.*,
 CASE WHEN plot_status='Plotted' THEN
  CASE WHEN quadrant IN ('Star','Cash Cow') THEN greatest(2,least(49.5,matrix_x))
   ELSE greatest(50.5,least(98,matrix_x)) END END plot_x,
 CASE WHEN plot_status='Plotted' THEN
  CASE WHEN quadrant IN ('Star','Question Mark') THEN greatest(50.5,least(98,matrix_y))
   ELSE greatest(2,least(49.5,matrix_y)) END END plot_y,
 CASE WHEN plot_status<>'Plotted' THEN plot_status
  WHEN arrangement_gate THEN 'Modified-schedule category placement'
  ELSE 'Measured score' END position_basis,
 CASE WHEN plot_status='Plotted' THEN relative_contribution<0 ELSE false END contribution_clipped,
 'bcg-display-v1'::text plot_method_version
FROM coordinates c;

COMMENT ON VIEW public.reporting_borrower_matrix_plot_v1 IS 'R029 display-only coordinates: fixed 0-100 matrix, midpoint 50; high health left, contribution >=1x above. Modified schedules at x75 are categorical placement, not a changed payment score. V3 is unchanged. Padding affects rendering only; invalid inputs and Unclassified remain explicit.';
