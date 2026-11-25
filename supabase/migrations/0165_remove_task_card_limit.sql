-- Owner 2026-11-25: no limit on task cards any more (0154 capped everyone at 5 open created cards). Cards / checklist items can be
-- added and sent for review without a cap. (Applied to production.)
drop trigger if exists trg_task_cards_limit on public.task_cards;
drop function if exists public.limit_task_cards_per_creator();
