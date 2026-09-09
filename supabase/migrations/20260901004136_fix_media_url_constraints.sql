-- Correct regular-expression escaping from the staged integrity migration.
-- Standard-conforming PostgreSQL strings pass backslashes through literally;
-- bracket expressions keep these patterns unambiguous and portable.

alter table public.songs
  drop constraint songs_source_url_check,
  drop constraint songs_file_path_check;

alter table public.songs
  add constraint songs_source_url_check
  check (
    source_url is null or (
      char_length(source_url) <= 2048
      and source_url ~* '^https://'
      and (
        source_url ~* '^https://([a-z0-9-]+[.])*(youtube[.]com|youtu[.]be)/'
        or source_url ~* '[.](mp3|m4a|aac|ogg|opus|wav|flac)([?][^#[:space:]]*)?$'
      )
    )
  ) not valid,
  add constraint songs_file_path_check
  check (
    file_url is null
    or file_url ~ '^music/[0-9a-f-]{36}/[0-9a-f-]{36}[.]mp3$'
  ) not valid;

alter table public.memories
  drop constraint memories_media_path_check;

alter table public.memories
  add constraint memories_media_path_check
  check (
    media_url is null
    or media_url ~ '^(photos/[0-9a-f-]{36}/[0-9a-f-]{36}[.]webp|avatars/[0-9a-f-]{36}/[0-9a-f-]{36}[.]webp|music/[0-9a-f-]{36}/[0-9a-f-]{36}[.]mp3)$'
  ) not valid;

alter table public.members
  drop constraint members_avatar_path_check;

alter table public.members
  add constraint members_avatar_path_check
  check (
    avatar_url is null
    or avatar_url ~ '^avatars/[0-9a-f-]{36}/[0-9a-f-]{36}[.]webp$'
  ) not valid;

alter table public.songs validate constraint songs_source_url_check;
alter table public.songs validate constraint songs_file_path_check;
alter table public.memories validate constraint memories_media_path_check;
alter table public.members validate constraint members_avatar_path_check;
