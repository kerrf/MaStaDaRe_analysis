-- Clear out the old precalculated data for this dashboard view
TRUNCATE TABLE summary_by_plz;

-- Recalculate everything fresh from the raw staging data
INSERT INTO summary_by_plz (plz, total_capacity, unit_count)
SELECT 
    plz, 
    SUM(netto_leistung_kw), 
    COUNT(id)
FROM raw_mastr_data
GROUP BY plz;