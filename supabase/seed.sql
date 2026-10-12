-- Development seed: FICTIONAL businesses only. Never run against production.
-- It attaches sample data to the earliest account, so sign up locally first, then run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/seed.sql
-- (`supabase db reset` runs this file too, but with no accounts yet it only prints a notice.)
do $$
declare
  v_org uuid;
  v_business uuid;
  v_funnel uuid;
begin
  select m.organization_id into v_org
  from public.organization_members m where m.role = 'owner' order by m.created_at limit 1;
  if v_org is null then
    raise notice 'Seed skipped: create an account first, then run supabase/seed.sql again.';
    return;
  end if;
  if exists (select 1 from public.funnels where slug = 'blue-lantern-cafe') then
    raise notice 'Seed skipped: sample data already present.';
    return;
  end if;

  insert into public.businesses (organization_id, name, category, description, time_zone, google_review_url)
  values (v_org, 'Blue Lantern Cafe', 'cafe', 'A fictional neighbourhood cafe used as sample data.', 'Asia/Kolkata',
          'https://search.google.com/local/writereview?placeid=FICTIONAL_DEMO_PLACE')
  returning id into v_business;

  insert into public.businesses (organization_id, name, category, description, time_zone)
  values (v_org, 'Maple Street Salon', 'salon', 'A fictional salon with no review link yet.', 'Asia/Kolkata');

  insert into public.funnels (business_id, name, slug, heading, description, instructions, languages, status)
  values (v_business, 'Tabletop QR', 'blue-lantern-cafe', 'How was your visit to Blue Lantern Cafe?',
          'Your honest feedback helps us improve and helps others decide.',
          'Pick what describes your visit. You stay in control of every word.', '{en,hi}', 'published')
  returning id into v_funnel;

  insert into public.funnel_feedback_attributes (funnel_id, label, label_hi, position) values
    (v_funnel, 'Friendly staff', 'मिलनसार स्टाफ़', 0),
    (v_funnel, 'Product quality', 'उत्पाद की गुणवत्ता', 1),
    (v_funnel, 'Clean environment', 'साफ़-सुथरा माहौल', 2),
    (v_funnel, 'Fast service', 'तेज़ सेवा', 3),
    (v_funnel, 'Good value', 'पैसे की सही कीमत', 4),
    (v_funnel, 'Convenient location', 'सुविधाजनक स्थान', 5),
    (v_funnel, 'Overall experience', 'कुल मिलाकर अनुभव', 6),
    (v_funnel, 'Areas for improvement', 'सुधार की गुंजाइश', 7);
end $$;
