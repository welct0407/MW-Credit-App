SELECT p.borrower_id, b."Description" AS name, p.quadrant AS category,
 p.reliability_score AS payment_score, p.relative_contribution,
 p.contribution_30d, p.outstanding_principal, p.confidence,
 p.arrangement_status, p.classification_reason, p.position_basis,
 p.reporting_date, p.plot_status, p.plot_x, p.plot_y,
 p.plot_method_version
FROM public.reporting_borrower_matrix_plot_v1 p
JOIN public.olap_borrowers_analytics b ON b."Row ID" = p.borrower_id
ORDER BY p.quadrant, p.borrower_id
