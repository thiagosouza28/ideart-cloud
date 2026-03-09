-- financial_entry_history is an audit table and must keep the entry id
-- even after the original financial entry is deleted.
alter table if exists public.financial_entry_history
  drop constraint if exists financial_entry_history_entry_id_fkey;
