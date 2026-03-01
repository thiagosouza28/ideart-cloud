-- Fix onboarding flow: allow authenticated users without company link
-- to create their first company record.

drop policy if exists "Users without company can create their first company" on public.companies;
drop policy if exists "Companies first insert during onboarding" on public.companies;

create policy "Companies first insert during onboarding"
  on public.companies
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and owner_user_id = auth.uid()
    and not exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.company_id is not null
    )
    and not exists (
      select 1
      from public.company_users cu
      where cu.user_id = auth.uid()
    )
  );
