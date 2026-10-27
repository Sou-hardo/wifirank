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

-- Speeds in Mbps, latency in ms, loss as a 0..1 ratio. Null = not measured.
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
  local_down real, local_up real, local_ping real,
  local_jitter real, -- legacy values remain for historical records; new tests do not populate or publish this field
  local_loss real,
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

-- Idempotent upgrades also applied by scripts/migrate.js to existing deployments.
alter table isps add column if not exists access_type text;
alter table isps add column if not exists tech text;
alter table tests add column if not exists district text;
alter table tests add column if not exists access_type text not null default 'fixed_line';
create index if not exists tests_asn_district on tests (asn, district, created_at) include (ip_hash, isp_id, flag, access_type);

-- Public pseudonym for a review, e.g. 'Sleepy Batman'. Random, unrelated to the device, never reused.
-- Two words while those last, then a second adjective ('Quiet Sleepy Batman') so the pool stays in the hundreds of thousands.
create or replace function review_name() returns text language plpgsql volatile as $$
declare
  adj text[] := array['Amber', 'Brave', 'Breezy', 'Bright', 'Calm', 'Cheerful', 'Clever', 'Cosmic', 'Cozy', 'Curious', 'Dapper', 'Daring', 'Dreamy', 'Eager', 'Earnest',
    'Fearless', 'Fuzzy', 'Gentle', 'Giddy', 'Golden', 'Graceful', 'Happy', 'Hardy', 'Honest', 'Humble', 'Jolly', 'Joyful', 'Keen', 'Kind', 'Lively',
    'Loyal', 'Lucky', 'Mellow', 'Merry', 'Mighty', 'Misty', 'Modest', 'Nimble', 'Noble', 'Patient', 'Peaceful', 'Peppy', 'Playful', 'Plucky',
    'Polite', 'Proud', 'Quick', 'Quiet', 'Rapid', 'Restless', 'Rustic', 'Serene', 'Shy', 'Silent', 'Silver', 'Sleepy', 'Snappy', 'Spry', 'Steady',
    'Stormy', 'Sturdy', 'Sunny', 'Swift', 'Thoughtful', 'Tidy', 'Tranquil', 'Trusty', 'Velvet', 'Vivid', 'Wandering', 'Watchful', 'Whimsical', 'Wily',
    'Wise', 'Witty', 'Zesty', 'Zippy'];
  -- Film, Marvel/DC, manga and manhwa characters, villains included, plus Bangladeshi and Bengali fiction
  who text[] := array['Neo', 'Trinity', 'Morpheus', 'Gandalf', 'Frodo', 'Samwise', 'Aragorn', 'Legolas', 'Gimli', 'Yoda', 'Chewbacca', 'Princess Leia', 'Han Solo',
    'Luke Skywalker', 'Obi-Wan', 'Indiana Jones', 'James Bond', 'Jack Sparrow', 'Forrest Gump', 'Rocky Balboa', 'Maximus', 'John Wick', 'Ethan Hunt',
    'Marty McFly', 'Doc Brown', 'Ellen Ripley', 'Sarah Connor', 'Katniss', 'Harry Potter', 'Hermione', 'Ron Weasley', 'Dumbledore', 'Hagrid', 'Dobby',
    'Shrek', 'Simba', 'Mufasa', 'Timon', 'Pumbaa', 'Woody', 'Buzz Lightyear', 'Nemo', 'Dory', 'WALL-E', 'Elsa', 'Olaf', 'Moana', 'Mulan', 'Aladdin',
    'Genie', 'Paddington', 'Willy Wonka', 'Sherlock Holmes', 'Zorro', 'Mad Max', 'Furiosa', 'Optimus Prime', 'Bumblebee', 'King Kong', 'Godzilla',
    'Baahubali', 'Kattappa', 'Pushpa', 'Munna Bhai', 'Feluda', 'Byomkesh', 'Professor Shonku', 'Tintin', 'Asterix', 'Obelix', 'Po', 'Master Shifu',
    'Toothless', 'Baymax', 'Remy', 'Stitch', 'Iron Man', 'Captain America', 'Thor', 'Hulk', 'Black Widow', 'Hawkeye', 'Spider-Man', 'Black Panther',
    'Doctor Strange', 'Scarlet Witch', 'Vision', 'Ant-Man', 'Wasp', 'Captain Marvel', 'Star-Lord', 'Gamora', 'Drax', 'Rocket', 'Groot', 'Nebula',
    'Wolverine', 'Storm', 'Cyclops', 'Jean Grey', 'Professor X', 'Magneto', 'Mystique', 'Nightcrawler', 'Rogue', 'Gambit', 'Deadpool', 'Daredevil',
    'Elektra', 'Moon Knight', 'Shang-Chi', 'Ms. Marvel', 'She-Hulk', 'Loki', 'Falcon', 'Winter Soldier', 'War Machine', 'Nick Fury', 'Okoye', 'Shuri',
    'Valkyrie', 'Miles Morales', 'Spider-Gwen', 'Venom', 'Blade', 'Ghost Rider', 'Human Torch', 'Invisible Woman', 'Mister Fantastic', 'Kate Bishop',
    'Wong', 'Mantis', 'Peggy Carter', 'Batman', 'Superman', 'Wonder Woman', 'Flash', 'Aquaman', 'Cyborg', 'Green Lantern', 'Green Arrow', 'Batgirl',
    'Robin', 'Nightwing', 'Supergirl', 'Catwoman', 'Harley Quinn', 'Shazam', 'Zatanna', 'Black Canary', 'Martian Manhunter', 'Hawkgirl', 'Starfire',
    'Raven', 'Beast Boy', 'Blue Beetle', 'Constantine', 'Alfred', 'Mera', 'Huntress', 'Batwoman', 'Superboy', 'Red Hood', 'Booster Gold',
    'Plastic Man', 'Lois Lane', 'Commissioner Gordon', 'Lucius Fox', 'Goku', 'Vegeta', 'Gohan', 'Piccolo', 'Bulma', 'Krillin', 'Trunks', 'Naruto',
    'Sasuke', 'Sakura', 'Kakashi', 'Itachi', 'Hinata', 'Jiraiya', 'Shikamaru', 'Rock Lee', 'Gaara', 'Luffy', 'Zoro', 'Nami', 'Sanji', 'Usopp',
    'Chopper', 'Nico Robin', 'Franky', 'Brook', 'Jinbe', 'Shanks', 'Ace', 'Ichigo', 'Rukia', 'Eren', 'Mikasa', 'Levi', 'Armin', 'Hange', 'Tanjiro',
    'Nezuko', 'Zenitsu', 'Inosuke', 'Rengoku', 'Gojo', 'Itadori', 'Megumi', 'Nobara', 'Nanami', 'Deku', 'Bakugo', 'Todoroki', 'Uraraka', 'All Might',
    'Saitama', 'Genos', 'Ryuk', 'Edward Elric', 'Alphonse', 'Roy Mustang', 'Spike Spiegel', 'Gon', 'Killua', 'Kurapika', 'Leorio', 'Guts', 'Anya',
    'Loid', 'Yor', 'Denji', 'Power', 'Aki', 'Thorfinn', 'Ash Ketchum', 'Pikachu', 'Doraemon', 'Nobita', 'Shinchan', 'Detective Conan', 'Sailor Moon',
    'Totoro', 'Kaneki', 'Asta', 'Yuno', 'Senku', 'Frieren', 'Fern', 'Himmel', 'Stark', 'Kenshin', 'Inuyasha', 'Kagome', 'Lelouch', 'Mob', 'Reigen',
    'Gintoki', 'Hanamichi', 'Tsubasa', 'Jotaro', 'Joseph Joestar', 'Giorno', 'Natsu', 'Erza', 'Yugi', 'Rimuru', 'Kirito', 'Asuna', 'Emilia', 'Rem',
    'Violet Evergarden', 'Maomao', 'Hinata Shoyo', 'Kageyama', 'Isagi', 'Bojji', 'Chihiro', 'Howl', 'Kiki', 'San', 'Nausicaa', 'Sung Jinwoo',
    'Cha Hae-In', 'Bam', 'Khun', 'Rak', 'Jin Mori', 'Cale Henituse', 'Kim Dokja', 'Yoo Joonghyuk', 'Han Sooyoung', 'Chung Myung', 'Desir',
    'Daniel Park', 'Vasco', 'Gray Yeon', 'Han Jihan', 'Arthur Leywin', 'Sylvie', 'Tessia', 'Athanasia', 'Yeon Sieun', 'Seo Joowon', 'Shin Wonho',
    'Jinwoo', 'Beru', 'Igris', 'Joker', 'Thanos', 'Darth Vader', 'Kylo Ren', 'Voldemort', 'Bellatrix', 'Sauron', 'Saruman', 'Gollum', 'Agent Smith',
    'Terminator', 'Scar', 'Jafar', 'Ursula', 'Maleficent', 'Cruella', 'Lord Farquaad', 'Hans Gruber', 'Captain Hook', 'Davy Jones', 'Bane',
    'Two-Face', 'Riddler', 'Penguin', 'Scarecrow', 'Poison Ivy', 'Mr. Freeze', 'Lex Luthor', 'Darkseid', 'Doomsday', 'General Zod', 'Deathstroke',
    'Reverse-Flash', 'Black Manta', 'Brainiac', 'Black Adam', 'Ultron', 'Hela', 'Killmonger', 'Green Goblin', 'Doctor Octopus', 'Kingpin',
    'Red Skull', 'Doctor Doom', 'Galactus', 'Mysterio', 'Sandman', 'Kang', 'Apocalypse', 'Sabretooth', 'Juggernaut', 'Carnage', 'Gabbar', 'Mogambo',
    'Bhallaladeva', 'Frieza', 'Cell', 'Majin Buu', 'Madara', 'Orochimaru', 'Pain', 'Obito', 'Kaido', 'Blackbeard', 'Doflamingo', 'Crocodile',
    'Mihawk', 'Aizen', 'Muzan', 'Akaza', 'Sukuna', 'Geto', 'Mahito', 'Shigaraki', 'Dabi', 'Toga', 'Light Yagami', 'Hisoka', 'Meruem', 'Griffith',
    'Makima', 'Askeladd', 'Dio', 'Johan Liebert', 'Zeref', 'Kaiba', 'Ainz', 'Jahad', 'Antares', 'Gun Park', 'Goo Kim', 'Himu', 'Misir Ali', 'Shuvro',
    'Rupa', 'Baker Bhai', 'Muna', 'Masud Rana', 'Sohana', 'Kabir Chowdhury', 'Kishore Pasha', 'Musa Aman', 'Robin Milford', 'Kuasha', 'Dipu', 'Tokai',
    'Basic Ali', 'Meena', 'Mithu', 'Raju', 'Halum', 'Tuktuki', 'Ikri', 'Shiku', 'Gopal Bhar', 'Lalkamal', 'Neelkamal', 'Dalimkumar', 'Tuntuni',
    'Rupban', 'Beder Meye Josna', 'Kuber', 'Ayna', 'Chan Majhi', 'Sonai', 'Pori', 'OC Harun', 'Allen Swapan', 'Chacha Chowdhury', 'Sabu', 'Tenida',
    'Ghanada', 'Kakababu', 'Nonte', 'Fonte', 'Bantul', 'Debdas', 'Montu', 'Tuni'];
  a text; candidate text; tries int := 0;
begin
  loop
    a := adj[1 + floor(random() * array_length(adj, 1))::int];
    candidate := a || ' ' || who[1 + floor(random() * array_length(who, 1))::int];
    if tries >= 5 then candidate := adj[1 + floor(random() * array_length(adj, 1))::int] || ' ' || candidate; end if;
    exit when candidate not like a || ' ' || a || ' %' and not exists (select 1 from reviews where name = candidate);
    tries := tries + 1;
  end loop;
  return candidate;
end $$;

create table if not exists reviews (
  device_id uuid not null,
  isp_id int not null references isps,
  name text not null unique default review_name(), -- the unique constraint is what guarantees no repeats
  stars smallint not null check (stars between 1 and 5),
  comment text check (length(comment) <= 1000),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (device_id, isp_id)
);

-- Databases created before reviews had names: add the column and name the existing rows one by one.
do $$
declare r record;
begin
  if not exists (select 1 from information_schema.columns where table_name = 'reviews' and column_name = 'name') then
    alter table reviews add column name text unique;
  end if;
  for r in select device_id, isp_id from reviews where name is null loop
    update reviews set name = review_name() where device_id = r.device_id and isp_id = r.isp_id;
  end loop;
end $$;
alter table reviews alter column name set default review_name();
alter table reviews alter column name set not null;
