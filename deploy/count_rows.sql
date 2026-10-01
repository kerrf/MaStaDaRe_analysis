-- The exact row count of every table and materialized view, one line each: "schema.name<TAB>table|view<TAB>rows".
-- push_db.sh writes it for the local database before the dump, restore_db.sh checks the restored one against it.
-- Leaves out the system schemas, what belongs to an extension (PostGIS brings its own spatial_ref_sys), meta (each
-- database keeps its own update history) and the schemas push_db.sh doesn't deploy (psql variable :excluded, e.g. "stg").
SELECT format(
    'SELECT %L, %L, count(*) FROM %I.%I',
    n.nspname || '.' || c.relname,
    CASE c.relkind WHEN 'm' THEN 'view' ELSE 'table' END,
    n.nspname,
    c.relname
)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p', 'm')
  AND NOT c.relispartition
  AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast', 'meta')
  AND n.nspname <> ALL (string_to_array(:'excluded', ','))
  AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
ORDER BY 1
\gexec
