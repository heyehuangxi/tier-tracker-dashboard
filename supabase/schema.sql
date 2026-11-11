-- 真戦勝率測定 — アカウント保存用スキーマ
--
-- 目的: ログインしたユーザーの所持・編成データ（ブラウザの localStorage に
-- 保存されている各キーの内容）を、サーバー側にユーザー単位で保存する。
--
-- 設計:
--   public.user_data は 1 ユーザー 1 行。data は jsonb で、
--   「localStorage のキー名 -> 保存文字列（JSON 文字列）」のマップをそのまま持つ。
--   アプリ側の保存形式（キー名・値の形式）は一切変更しない。
--
-- 実行方法: Supabase ダッシュボードの SQL Editor でこのファイル全体を実行する。
-- 何度実行しても同じ結果になるよう、冪等な書き方にしてある。

create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.user_data is
  'ユーザーごとのアプリデータ保存。data は localStorage キー名 -> 保存文字列のマップ。';

-- updated_at を書き込みのたびに自動更新する
create or replace function public.touch_user_data_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_data_touch_updated_at on public.user_data;
create trigger user_data_touch_updated_at
  before insert or update on public.user_data
  for each row execute function public.touch_user_data_updated_at();

-- Row Level Security: 本人以外の行は一切読み書きできない
alter table public.user_data enable row level security;

drop policy if exists "user_data_select_own" on public.user_data;
create policy "user_data_select_own"
  on public.user_data for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_data_insert_own" on public.user_data;
create policy "user_data_insert_own"
  on public.user_data for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_data_update_own" on public.user_data;
create policy "user_data_update_own"
  on public.user_data for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_data_delete_own" on public.user_data;
create policy "user_data_delete_own"
  on public.user_data for delete
  to authenticated
  using (auth.uid() = user_id);

-- テーブル権限（RLS が行単位の制御を担うため、権限自体は authenticated に開く）
grant select, insert, update, delete on public.user_data to authenticated;
