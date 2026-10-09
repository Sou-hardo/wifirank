create table if not exists isps (
  id serial primary key,
  name text not null unique,
  slug text not null unique,
  aliases text[] not null default '{}',
  website text,
  asn int,
  approved boolean not null default true, -- user-added ISPs start unapproved
  created_at timestamptz not null default now()
);

-- Speeds in Mbps, latency/jitter in ms, loss as a 0..1 ratio. Null = not measured.
create table if not exists tests (
  id bigserial primary key,
  device_id uuid not null,
  isp_id int not null references isps,
  area text not null,
  lat real, -- rounded to ~500 m grid before storing
  lng real,
  connection text not null check (connection in ('cable', 'wifi5', 'wifi24', 'wifi')),
  plan text,
  price text, -- monthly bill in ৳ (early rows hold range keys like '800-1200')
  -- Measured against Cloudflare's Dhaka edge (the domestic path)
  local_down real, local_up real, local_ping real, local_jitter real, local_loss real,
  ip_hash text not null,
  asn int,
  as_org text,
  country text,
  flag text, -- non-null = excluded from stats (mobile_data, foreign_ip)
  created_at timestamptz not null default now()
);
create index if not exists tests_isp_area on tests (isp_id, area, created_at);
create index if not exists tests_device on tests (device_id, created_at);
create index if not exists tests_ip on tests (ip_hash, created_at);

create table if not exists reviews (
  device_id uuid not null,
  isp_id int not null references isps,
  stars smallint not null check (stars between 1 and 5),
  comment text check (length(comment) <= 1000),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (device_id, isp_id)
);
