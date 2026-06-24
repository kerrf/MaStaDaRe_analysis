-- Clear out the old precalculated data for this dashboard view
TRUNCATE TABLE summary_by_month;

-- Recalculate everything fresh from the raw staging data
INSERT INTO summary_by_month (month, total_capacity, unit_count)
SELECT 
    EXTRACT(MONTH FROM date) as month, 
    SUM(netto_leistung_kw) as netto_leistung_kw, 
    COUNT(id)
FROM raw_mastr_data
GROUP BY plz;