-- The server's part of deploy/push_raw_tables.sh: the uploaded tables, restored into schema raw_next of the live
-- database, replace those in raw, all in one transaction (psql --single-transaction). psql variable :tables, e.g.
-- "grid_operators,grid_connection_points".
-- A table that's new moves over as it is (with its key and comment). One that's there keeps its place, so the views
-- built on it stay: it gets the columns the export added, is emptied and filled anew, and takes the new comment (which
-- export it holds). Columns the export dropped stay, empty. What the nightly update noted for them goes (meta.sync_state):
-- its next run fetches every change since the export.
\o /dev/null
SELECT set_config('push.tables', :'tables', true);
\o

DO $$
DECLARE
    t text;
    col record;
    cols text;
BEGIN
    FOREACH t IN ARRAY string_to_array(current_setting('push.tables'), ',') LOOP
        IF to_regclass(format('raw_next.%I', t)) IS NULL THEN
            RAISE EXCEPTION 'raw_next.% is missing: the upload is incomplete', t;
        END IF;
        IF to_regclass(format('raw.%I', t)) IS NULL THEN
            EXECUTE format('ALTER TABLE raw_next.%I SET SCHEMA raw', t);
            RAISE NOTICE '%: new', t;
            CONTINUE;
        END IF;
        FOR col IN
            SELECT c.column_name, c.data_type
            FROM information_schema.columns c
            WHERE c.table_schema = 'raw_next' AND c.table_name = t
              AND NOT EXISTS (
                  SELECT FROM information_schema.columns o
                  WHERE o.table_schema = 'raw' AND o.table_name = t AND o.column_name = c.column_name
              )
            ORDER BY c.ordinal_position
        LOOP
            EXECUTE format('ALTER TABLE raw.%I ADD COLUMN %I %s', t, col.column_name, col.data_type);
            RAISE NOTICE '%: new column %', t, col.column_name;
        END LOOP;
        SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position) INTO cols
        FROM information_schema.columns
        WHERE table_schema = 'raw_next' AND table_name = t;
        EXECUTE format('TRUNCATE raw.%I', t);
        EXECUTE format('INSERT INTO raw.%I (%s) SELECT %s FROM raw_next.%I', t, cols, cols, t);
        EXECUTE format(
            'COMMENT ON TABLE raw.%I IS %L', t, obj_description(format('raw_next.%I', t)::regclass, 'pg_class')
        );
        RAISE NOTICE '%: replaced', t;
    END LOOP;
END
$$;

DO $$
BEGIN
    IF to_regclass('meta.sync_state') IS NOT NULL THEN
        DELETE FROM meta.sync_state WHERE table_name = ANY(string_to_array(current_setting('push.tables'), ','));
    END IF;
END
$$;

DROP SCHEMA raw_next CASCADE;
