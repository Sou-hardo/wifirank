# WifiRank E2E UX audit, 2026-10-24

Live site: https://wifirank.vercel.app (deployed from `main` @ `806c900`: nationwide directory, ISP auto-detection with upstream suggestions, gpfi home-router declaration, map).
Judged against the product goal: **smooth interactions with minimal inputs, no distraction from verbosity, while keeping the flair** (dither, Doto/Space Grotesk, the GO dial, the map, motion).

## Summary

Tracked in GitHub issues **#11–#45**, with tracking issue **#46**.

| Severity | Count | Meaning |
|---|---|---|
| P0 | 0 | Blocks a core task for most users |
| P1 | 10 | Core flow costs extra taps, loses data or misleads |
| P2 | 14 | Noticeable friction, polish or a11y gap |
| P3 | 11 | Minor or cosmetic |

No P0: every core task completed on every form factor. The P1s cluster around three themes:

1. **The test asks for too much before it starts.** Mobile is 4–5 taps to first byte; the setup card stacks a district filter, combobox, detection card and hints.
2. **The result moment wobbles.** The needle sweeps backwards, the numbers sit below the fold, and Back throws the result and review away.
3. **The new 2,928-provider directory is honest but unhelpful.** District pages list 192 nationwide licences first, ISP pages lead with licence boilerplate, and the data has duplicates and junk names.

### Coverage

- **Pages:** `/`, `/isps` (search, district, pagination, empty, out-of-range page), `/isp/link3`, `/isp/help-line`, `/isp/gpfi`, `/isp/star-link` (Starlink), `/isp/weblink-communications` (no packages), `/isp/net-express-online`, a junk-name ISP, `/district/dhaka|bogura|sylhet|bandarban|jhalakathi`, `/area/banani`, `/area/sylhet` (301), `/map` (+`?isp=`), `/methodology`, 404s (`/isp/nope`, `/area/nope`, `/district/nope`, random path), `/sitemap.xml` (2,999 URLs), `/llms.txt`, `/robots.txt`, `/api/stats`, `/api/map`, OG images.
- **Interactions:** provider combobox (typing, keyboard, Enter, blur-match, "Add …"), district filter, detection and upstream suggestion, connection segment, gpfi checkbox, GO (desktop and mobile sheet), location allow and deny, pin picker (tap, confirm), running state, result, review stars and chips (not submitted), Share (desktop download, iOS share sheet), Compare ISPs, Test again, Back/forward, map metric/district/provider/zoom/hover/tap/list, directory search/filter/pagination, keyboard Tab order and focus.
- **Form factors:** desktop 1440×900 and laptop 1024×768 in the T3 browser.
  - **iOS:** a real iOS 27 Simulator in Safari (`snuggycat-243-verify`). The iPhone 17 and 17e were locked by other threads' agent-device sessions, and I retried for about 10 minutes.
  - **Android:** a real Android 16 emulator in Chrome (`emulator-5556`, driven with adb because its agent-device lease was stale). `Pixel_API_36` was locked by another session.
  - **Preview:** a supplementary 390×844 layout pass in the browser preview.
- **Real speed tests:** 3 in total, all as NET Express Online, the detected network:
  - Desktop, Banani pin: 42 / 102 Mbps, 5.5 ms.
  - iOS, auto-location set to Kawran Bazar: 102 Mbps.
  - Android, blind pin in Banani: 41 Mbps.
- **Reviews:** none submitted. The review form was exercised without submitting.

### Measured performance (desktop, warm-ish)

- TTFB 47 ms, DCL 552 ms, LCP 2.6 s (the lede paragraph, after fonts and the map).
- `/api/whoami` resolves at about 2.2 s and causes the only layout shift (CLS 0.03).
- Home HTML is 341 KB decoded (53 KB gzipped), because all 2,928 provider tuples are hydrated into the island.
- OG PNGs take 1.0–1.5 s to render cold.

---

## P1

### P1-1 · Starting a test on a phone takes 4–5 taps, and GO doesn't go (#11)
- **Where:** `/`, mobile (iOS Safari, Android Chrome, 390 preview).
- **Steps:**
  1. Tap the lime GO. It only opens the bottom sheet.
  2. Pick a connection tile.
  3. Tap "Start test".
  4. Answer the OS location prompt (2 prompts on iOS: Safari, then the site), or drop a pin and tap "Use this location".
- **Also:** on desktop, GO stays grey until the left form is complete, and "PLEASE SELECT ↓" bounces forever. The connection is deliberately never remembered, so repeat testers answer it every time.
- **Why it hurts:** the most important action on the site is also the most tap-heavy, and the hero's promise ("GO") is broken by a form.
- **Evidence:** [ios-home-initial](screenshots/ios-home-initial.png), [ios-sheet-open](screenshots/ios-sheet-open.png), [ios-location-permission-prompt](screenshots/ios-location-permission-prompt.png), [home-mobile390-preview-sheet-3-taps](screenshots/home-mobile390-preview-sheet-3-taps.png), video [test-ios-full-flow-share-sheet](videos/test-ios-full-flow-share-sheet.mp4)
- **Mockup:** [01-start-flow](mockups/01-start-flow.html). **Recommend C, "ask only what's missing; the answer starts":** GO + 1 tap, with no guessed connection.

### P1-2 · The setup card is verbose, shifts layout, and its district filter creates duplicate providers (#12)
- **Where:** `/`, all form factors.
- **The card stacks:**
  - "Filter providers by district" select.
  - A 2,928-row combobox.
  - A detection card ("Detected NET Express Online's network. On a local ISP? Choose it above." + "Use NET Express Online").
  - After choosing, a second hint ("Detected from your connection. Use a local provider? Pick it instead.").
  - A reserved empty `.field-note` gap.
- **The card arrives about 2 s after paint:**
  - It pushes the connection tiles and the GO dial down (CLS 0.03).
  - At 1440×900 the form ends below the fold (card bottom at 908 px).
  - On phones the "sheet" grows to almost full screen with a big blank gap.
- **The district filter hides providers rather than ranking them.** With "Sylhet" selected, typing "starlink" offers only "+ Add 'starlink'", because Star Link is listed under Dhaka. That creates a pending duplicate. The empty list is just licence-holders in id order, and the detected provider is not in it.
- **Evidence:** [home-desktop1440-before-detection](screenshots/home-desktop1440-before-detection.png) → [home-desktop1440-after-detection-layout-shift](screenshots/home-desktop1440-after-detection-layout-shift.png), [ios-sheet-open](screenshots/ios-sheet-open.png), video [home-desktop-load-detection-layout-shift-combobox](videos/home-desktop-load-detection-layout-shift-combobox.mp4)
- **Mockup:** [02-provider-detection](mockups/02-provider-detection.html). **Recommend A, "detected chip, quiet Change":** four elements become one line, and the district becomes a ranking hint.

### P1-3 · gpfi tests silently don't count unless a hidden checkbox is ticked (#13)
- **Where:** `/`, after choosing gpfi (`fixedWireless` provider).
- **Steps:** pick gpfi. An **unchecked** "5G/4G home router (e.g. gpfi)" checkbox appears under the connection tiles.
- **Effect:** if it's left unchecked, the server classifies the test as `mobile_data` and the result "won't count toward gpfi" (`classifyAccess` in `src/lib/detection.ts`). gpfi is a home-router product, so the safe default is inverted, and the explanation only appears after the 40 s test.
- **Evidence:** [home-desktop-gpfi-checkbox-unchecked-map-ignores-district](screenshots/home-desktop-gpfi-checkbox-unchecked-map-ignores-district.png)
- **Mockup:** [03-connection-fwa](mockups/03-connection-fwa.html). **Recommend A:** a preselected "5G router" tile for FWA providers.

### P1-4 · The result needle sweeps backwards, and most of the result sits below the fold (#14)
- **Where:** `/`, done state, all form factors.
- **The needle:**
  - At the end, `Gauge` eases from the last live upload value to the download value (102 → 42 over about 2 s).
  - A glance or screenshot during that time shows a wrong number (captured: gauge "67" while the pin says "42 MBPS").
  - It reads as "my speed is dropping".
- **Below the fold:**
  - Upload, ping and jitter live in a separate "Your result" card under the hero (top at 1,044 px on a 900 px desktop).
  - The left card is filled by the review form, so Share / Compare / Test again also fall below the fold.
- **On iOS:** the done-state dial shrinks onto the map edge, the readout crowds the tick labels, and the pin is squeezed into a corner.
- **Evidence:** [test-desktop-done-gauge-easing-shows-67-vs-pin-42](screenshots/test-desktop-done-gauge-easing-shows-67-vs-pin-42.png), [test-desktop-done-results-below-fold](screenshots/test-desktop-done-results-below-fold.png), [ios-test-done](screenshots/ios-test-done.png), video [test-desktop1440-full-flow-gauge-backsweep-card-covers-edge](videos/test-desktop1440-full-flow-gauge-backsweep-card-covers-edge.mp4)
- **Mockup:** [04-result-reveal](mockups/04-result-reveal.html). **Recommend A:** the dial holds the result, with satellites for upload and ping.

### P1-5 · "Compare ISPs" then Back throws away the result and any half-written review (#15)
- **Where:** `/` done state → "Compare ISPs" → browser Back.
- **Steps:** rate 4 stars (not submitted), click Compare ISPs, then press Back. You land on the setup phase: the result is gone and the review is lost, with no warning.
- **Why it hurts:** comparing is the obvious next step, and it costs the contribution the site wants most (a rating with a price).
- **Evidence:** [review-desktop-stars-taka-glyph-fallback](screenshots/review-desktop-stars-taka-glyph-fallback.png), [area-view-transition-midframe](screenshots/area-view-transition-midframe.png), video [review-desktop-compare-then-back-loses-result](videos/review-desktop-compare-then-back-loses-result.mp4)
- **Mockup:** [05-review](mockups/05-review.html). **Recommend B, "tap a star = posted":** nothing is left unsaved. Also persist the last result in `sessionStorage` so Back restores the done state.

### P1-6 · District pages bury local providers under 192 nationwide licences (#16)
- **Where:** `/district/bandarban` (and every district).
- **Symptom:** the page says "193 providers · Page 1 of 4", but the first 192 are nationwide licences in id order. Bandarban's only local ISP is not on page 1. Jhalakathi is the same.
- **Why:**
  - Every district page looks nearly identical, so it doesn't answer "who serves my district?".
  - The table repeats "Nationwide" and "Nationwide licence" in two columns.
  - The Search button stretches full width when the district field is hidden.
  - The breadcrumb renders as "Providers/Bandarban" with no spacing, and its root label differs from the ISP pages' "Rankings".
- **Evidence:** [district-bandarban-nationwide-flood-breadcrumb-oversized-search](screenshots/district-bandarban-nationwide-flood-breadcrumb-oversized-search.png)
- **Mockup:** [07-district-directory](mockups/07-district-directory.html). **Recommend A:** local first, nationwide folded.

### P1-7 · ISP pages lead with licence boilerplate; the measured speed is below it (#17)
- **Where:** `/isp/link3`, `/isp/net-express-online`, every tested ISP.
- **What comes first:**
  - "Provider information": "Nationwide licence", then "Nationwide licence scope. Confirm local availability…".
  - A 10-row package table whose Source column repeats the same hostname on every row.
  - A sources disclaimer that leaks internal tags ("Directory sources: bdix.app, wifirank").
  - Only after all that, the measured stats.
- **CTAs:**
  - "Test your Link3" and "Test from Banani" link to `/` without preselecting the provider or area.
  - "See on map" on an untested provider opens an empty map.
- **Copy:** "★ 3.8 (1 reviews) · 1 testers · 1 tests".
- **Evidence:** [isp-link3-stats-buried-plural-bugs](screenshots/isp-link3-stats-buried-plural-bugs.png)
- **Mockup:** [09-isp-page](mockups/09-isp-page.html). **Recommend A**, measured first with the directory folded, plus C as the shared untested state for the ~2,900 untested pages.

### P1-8 · No fallback when the map can't render (WebGL-less devices) (#18)
- **Where:** `/` and the location picker. Reproduced on the Android 16 emulator in Chrome.
- **The hero map never draws:** the page is just blank, and `TestMap` has no error state (unlike `DhakaMap`).
- **With location denied, the picker is a blank panel:**
  - The "Loading map…" text disappears.
  - "Use my location" says "Couldn't get your location. Tap the map instead."
  - "Use this location" stays disabled.
  - A blind tap on the blank area does place a pin (MapLibre still receives clicks), but no real user would think to do that.
- **Why it hurts:** low-end Android phones, battery-saver modes and WebGL-blocked browsers lose the ability to start a test.
- **Evidence:** [android-home-initial](screenshots/android-home-initial.png), [android-picker-blank-map-no-fallback](screenshots/android-picker-blank-map-no-fallback.png), [android-picker-blind-tap-works](screenshots/android-picker-blind-tap-works.png), [android-test-done](screenshots/android-test-done.png), video [test-android-no-webgl-blank-map-picker-blind-tap](videos/test-android-no-webgl-blank-map-picker-blind-tap.mp4)
- **Mockup:** [06-location-fallback](mockups/06-location-fallback.html). **Recommend A:** area chips work without a map. Also render the dither backdrop when the hero map fails.

### P1-9 · On phones, tapping a map bubble updates a panel you can't see (#19)
- **Where:** `/map`, mobile (iOS Safari, 390 preview).
- **Symptom:**
  - The metric switch, district, provider, legend and area detail all stack below a fixed-height map.
  - Tapping a bubble selects the area and flies the map, but the detail list and "All providers in …" render about 1,016 px down, offscreen.
  - iOS shows the hover tooltip on tap, which helps, but it never closes and isn't actionable.
- **Evidence:** [ios-map](screenshots/ios-map.png), [ios-map-tap-bubble-no-visible-detail](screenshots/ios-map-tap-bubble-no-visible-detail.png), [map-mobile390-preview-panel-below-map](screenshots/map-mobile390-preview-panel-below-map.png), video [map-ios-tap-bubble-detail-offscreen](videos/map-ios-tap-bubble-detail-offscreen.mp4)
- **Mockup:** [10-map-mobile](mockups/10-map-mobile.html). **Recommend A:** a peek sheet over the map.

### P1-10 · Directory data: duplicates, junk names and mis-scoped flagship providers (#20)
- **Where:** `data/isps.json` (2,927 rows; the DB has 2,928 approved), surfaced in the combobox, `/isps`, the sitemap and OG images.
- **Mis-scoped flagship providers:**
  - **Starlink** is "Star Link", listed for Dhaka only, with licence "Satellite, Upazila/Thana". It is invisible from every other district's filter (see P1-2), and its address includes "SpaceX Operations, Hawthorne, California".
  - **gpfi** is Dhaka-only, with the licence label "Wireless Broadband".
- **Duplicates:**
  - DB: "Net Express" vs "NET Express Online" (both on `/map`).
  - Accent-only pairs: "Cafe-7040"/"Café-7040", "Alifa Cyber Cafe"/"…Café", "Cyber Net Cafe"/"…Café", "Talha Cafe"/"…Café".
  - Typos: "Nazrul Natwork Service@Saidpur" vs "Nazrul Network…".
  - 361 near-duplicate name groups when you normalise suffixes (e.g. "Click", "Click Online", "Click Net BD"…). Not all are wrong, but there's no disambiguation such as district beside the name.
- **Junk names:**
  - **112** names carry a BTRC "initials + M/S" prefix ("AA M/S. Al Amin Enterprise", "FN M/S Fibernet Network").
  - **16** carry "t/a / trading as" owner names.
  - **5** carry "Chattogram Division" suffixes.
  - Some carry address fragments ("Hilsa BD Broadband Network Chattogram Division Holding No: 130/116-A, Professor", which also makes a three-line OG title).
- **Slugs:** `é` is dropped rather than transliterated (`alifa-cyber-caf`, 15 slugs).
- **Packages:** gpfi's "gpfi1000 x12M ৳12000" and "20 Mbps - 180 Days ৳5100" appear under a "Monthly BDT" column.
- **Unconfirmed locations:** 638 providers have neither districts nor a nationwide flag ("Location not confirmed"), including "Dhaka Internet" and "Dhaka Fiber Link" (Divisional licence).
- **Evidence:** [og-isp-long-name-hilsa](screenshots/og-isp-long-name-hilsa.png). The analysis script output is in this report. Reproduce it with the normalisation snippet in *Appendix A*.
- **Recommendation:** a cleaning pass in `scripts/build-directory.ts`:
  - Strip the `^[A-Z]{1,3} M/?S\.? ` prefix, `t/a` owner names, "<Division> Division" and "Holding No…".
  - Transliterate é in slugs.
  - Merge accent and typo pairs.
  - Mark Starlink as nationwide and satellite, and gpfi as nationwide FWA.
  - Normalise non-monthly packages.

---

## P2

### P2-1 · The running card covers the "Cloudflare · Dhaka" end of the packet arc, and the advice is verbose (#21)
- **Where:** `/` running state, desktop 1440.
- **Symptom:** the left card ("WHILE YOU WAIT · Keep this tab open, and pause downloads…") overlaps the edge marker label ("…OFLARE · DHAKA"). Finished ping disappears once download starts.
- **Evidence:** [test-desktop-ping-card-covers-edge-marker](screenshots/test-desktop-ping-card-covers-edge-marker.png), [test-desktop-download-stage](screenshots/test-desktop-download-stage.png)
- **Mockup:** [13-running-card](mockups/13-running-card.html). **Recommend B:** live readouts that fill in by stage.

### P2-2 · Location denied: the picker opens without saying why, then needs tap + confirm (#22)
- **Where:** `/`, desktop (preview denies geolocation) and Android.
- **Symptom:**
  - "Where are you testing from? Tap your district or Dhaka neighbourhood…" appears, but there are no district targets on the map.
  - Placing a pin needs a second press on "Use this location".
  - The site never primes the OS prompt (iOS shows two prompts).
- **Evidence:** [picker-desktop-geo-denied-no-explanation-backdrop-ghosting](screenshots/picker-desktop-geo-denied-no-explanation-backdrop-ghosting.png), [picker-desktop-pin-placed](screenshots/picker-desktop-pin-placed.png)
- **Mockup:** [06-location-fallback](mockups/06-location-fallback.html). **Recommend A.**

### P2-3 · Directory search needs a submit and a full reload, pagination is Previous/Next over 59 pages, and phone tables scroll sideways (#23)
- **Where:** `/isps`, `/district/*`, desktop and mobile.
- **Symptom:**
  - Typing then Enter reloads the page and scrolls you back to the top.
  - The directory form doesn't auto-submit on district change, though the rankings form below does.
  - On phones the 4-column table is clipped with a horizontal scroll.
  - Rows animate in one by one (`tbody tr { animation: rise … }`), so a fast scroll shows blank rows.
- **Evidence:** [isps-desktop-directory-first-redundant-columns](screenshots/isps-desktop-directory-first-redundant-columns.png), [isps-mobile390-preview-table-clipped-fade-rows](screenshots/isps-mobile390-preview-table-clipped-fade-rows.png), video [isps-district-isp-map-desktop-walkthrough](videos/isps-district-isp-map-desktop-walkthrough.mp4)
- **Mockup:** [08-directory-search](mockups/08-directory-search.html). **Recommend A:** instant filter, with card rows on phones.

### P2-4 · Share: silent download on desktop, no link anywhere, and the wrong host on the image (#24)
- **Where:** `/` done state.
- **Symptom:**
  - Desktop "Share" downloads `wifirank-result.png` with no feedback.
  - iOS opens the share sheet with **only the PNG**: no URL, so no traffic back.
  - The image prints `location.host` (`wifirank.vercel.app`) while canonical/OG point to `www.wifirank.site`.
- **Evidence:** [share-desktop-downloaded-result](screenshots/share-desktop-downloaded-result.png), [ios-share-sheet](screenshots/ios-share-sheet.png)
- **Mockup:** [11-share](mockups/11-share.html). **Recommend A:** a share popover with a live preview, and `navigator.share({ files, url })`.

### P2-5 · The hero headline fights the map's place labels (#25)
- **Where:** `/`, desktop 1440 and 1024, mobile.
- **Symptom:** Bengali and English labels (Khagan, Banagram, Savar, Pallabi…) run through the Doto headline and lede.
- **Evidence:** [home-laptop1024-map-labels-behind-headline](screenshots/home-laptop1024-map-labels-behind-headline.png), [home-desktop-ready-to-go](screenshots/home-desktop-ready-to-go.png)
- **Mockup:** [12-hero-legibility](mockups/12-hero-legibility.html). **Recommend B:** a dither mask.

### P2-6 · The map's district select fights the camera and never resets (#26)
- **Where:** `/map`, desktop.
- **Symptom:**
  - Choosing Sylhet calls `flyTo(zoom 9)`, but the selection effect immediately flies to `zoom ≥ 13`, so you land inside the city.
  - Choosing "All Bangladesh" leaves the map on Sylhet with Sylhet still selected.
  - Untested districts show "No tests here yet. Run the first one" but no link to the 130-provider directory for that district.
  - Client-side provider filtering doesn't update `?isp=` (not shareable).
  - At country zoom, Dhaka's ~100 hollow neighbourhood dots merge into a grey blob (no clustering).
  - Selected-area labels duplicate the basemap label ("Banani" twice).
- **Evidence:** [map-desktop-district-sylhet-zoom13-dead-end](screenshots/map-desktop-district-sylhet-zoom13-dead-end.png), [map-desktop-country-zoom-dhaka-blob](screenshots/map-desktop-country-zoom-dhaka-blob.png), [map-desktop-banani-selected-double-label](screenshots/map-desktop-banani-selected-double-label.png), [map-desktop-default-dhaka-hollow-dot-noise](screenshots/map-desktop-default-dhaka-hollow-dot-noise.png)
- **Mockup:** [10-map-mobile](mockups/10-map-mobile.html) (panel pattern).
- **Recommendation:** respect the district zoom, reset on "All", link to `/district/<slug>`, cluster hollow dots below zoom 9, and hide the area label where the basemap already names it.

### P2-7 · The skip link is never visible (#27)
- **Where:** all pages, keyboard.
- **Symptom:** "Skip to content" uses `.sr-only` with no `:focus` override, so it stays clipped to 1 px when focused. Also, MapLibre's "Toggle attribution" sits in the tab order before the form.
- **Fix:** `.sr-only:focus { clip:auto; width:auto; height:auto; … }`, styled as a lime chip.

### P2-8 · Stale Dhaka-only copy on a nationwide product (#28)
- `/isps` meta description: "${n} **Dhaka ISPs** ranked…".
- `/methodology` meta description: "how WifiRank tests internet speed **in Dhaka**".
- `/map` canvas `aria-label`: "Map **of Dhaka**…".
- OG ISP card: "Measured by 1 users **in Dhaka**" (Link3, nationwide).
- Home FAQ #1 is Dhaka-specific.
- Gauge comment: "Dhaka plans span…".

### P2-9 · Pluralisation and empty states in generated copy (#29)
- ISP header: "(1 reviews) · 1 testers · 1 tests".
- OG: "1 users".
- The untested OG card shows "▪▪▪▪▪" with a misaligned floating "Mbps".
- Area page with one tester shows rank "1" on a dimmed row and a "Latest tests" table that repeats the ranking table.
- **Evidence:** [og-isp-link3](screenshots/og-isp-link3.png), [og-isp-long-name-hilsa](screenshots/og-isp-long-name-hilsa.png), [area-banani-duplicate-latest-table](screenshots/area-banani-duplicate-latest-table.png)

### P2-10 · Mobile Safari: the step pills sit under the floating toolbar (#30)
- **Where:** iOS 27 Safari, running state.
- **Symptom:** the PING / DOWNLOAD / UPLOAD pills land right on Safari's bottom bar, and the hero isn't `svh`-aware (the stats band peeks under the URL bar on load).
- **Evidence:** [ios-test-running](screenshots/ios-test-running.png), [ios-home-initial](screenshots/ios-home-initial.png)

### P2-11 · The empty home below the hero (#31)
- **Where:** `/`.
- **Symptom:** with 3 tests and no provider over `MIN_DEVICES`, the Rankings section disappears entirely, and the stats band shows "3 / 3 / 3" in huge dot-matrix type. The new 2,928-provider directory, the strongest content today, isn't linked from the home body at all.
- **Recommendation:** while data is thin, swap the band for "2,928 providers · 64 districts · find yours" with a district chip row.

### P2-12 · Performance: the home page hydrates the whole directory (#32)
- **Symptom:** the home island's props carry every provider tuple (341 KB decoded HTML), and `/api/whoami` takes about 2.2 s before detection can render.
- **Recommendation:** ship detected and nearby providers first and lazy-load the full list on combobox focus (the review already lazy-loads `isp-packages.json`). Cache `whoami` per IP for the session.

### P2-13 · The combobox list is noisy (#33)
- **Symptom:**
  - Every row repeats "Nationwide licence".
  - The first row (Link3) is pre-highlighted on focus, so Enter picks it without typing.
  - The detected provider isn't surfaced first.
- **Evidence:** [home-desktop-combobox-open-map-tiles-missing](screenshots/home-desktop-combobox-open-map-tiles-missing.png)
- **Mockup:** [02](mockups/02-provider-detection.html) A/B.

### P2-14 · Review form length (#34)
- **Symptom:** 9–10 package chips (NET Express) plus "Not listed?" input plus Submit plus a privacy line push the actions below the fold on every form factor.
- **Evidence:** [ios-done-scrolled](screenshots/ios-done-scrolled.png), [ios-done-actions](screenshots/ios-done-actions.png)
- **Mockup:** [05-review](mockups/05-review.html). **Recommend B.**

---

## P3

1. **District names:** "Coxsbazar" (should be "Cox's Bazar"), "Barisal", "Comilla" next to "Chattogram" and "Bogura"; the Bandarban division renders as "Chattagram division". (#35)
2. **Taka glyph:** "৳" isn't in Space Grotesk and falls back to a system face (reads like "b525") in chips and tables. [review-desktop-stars-taka-glyph-fallback](screenshots/review-desktop-stars-taka-glyph-fallback.png) (#36)
3. **Map label overlap:** the selected-area label sits on top of the basemap's own label (also noted in P2-6). (#37)
4. **Hero map tiles:** transient blank tile chunks during the first re-frame. [home-desktop-combobox-open-map-tiles-missing](screenshots/home-desktop-combobox-open-map-tiles-missing.png) (#38)
5. **Picker backdrop ghosting:** the dialog backdrop showed a mirrored ghost of the page in the T3 preview renderer. Likely a capture artifact of `backdrop-filter: blur`; verify in desktop Chrome. [picker-desktop-geo-denied-no-explanation-backdrop-ghosting](screenshots/picker-desktop-geo-denied-no-explanation-backdrop-ghosting.png) (#39)
6. **Sitemap:** it lists all 2,927 ISP pages, including the junk-name records (thin, near-duplicate pages). (#40)
7. **District search button:** on `/district/*` it stretches full width (`auto-fit` grid with one field). (#41)
8. **Breadcrumbs:** root label "Providers" on district pages vs "Rankings" on ISP and area pages, plus the missing separator spacing. (#42)
9. **Home CTA:** "Run the speed test" (`href="#main"`) scrolls to the top but doesn't open the mobile sheet or focus anything. (#43)
10. **Map hint copy:** "Darker = faster. Bigger circle = more testers. Hollow dot = no tests yet." is always shown; a one-time hint or legend tooltip is enough. (#44)
11. **Rankings filter:** the `/isps` "Area" select mixes 98 neighbourhoods and 64 districts in one 162-item list. (#45)

## What works well (keep)

- **The run itself is a delight:** the fly-in tilt, packet arc speed tied to the measured Mbps, stage pills, a pin that lands in the speed colour, dot-confetti, and the dice name reveal. Reduced-motion paths exist in the Gauge, TestMap, fx and dither.
- **Detection is accurate:** it recognised the real network (NET Express Online), correctly flagged it as upstream, and prefilled the district (Dhaka).
- **The 404** ("No signal") and **Methodology** pages are clean and on-brand.
- **Robust URLs:** `/area/<district>` → 301 → `/district/<slug>`, and out-of-range `?page=` clamps.
- **Share image:** the dot-matrix share PNG is handsome.

---

## Enhancements: bolder ideas in the same spirit

1. **The dial as the whole form.** Provider and connection become rings on the GO dial (provider on the outer track as a curved label, connection as four tick-chips). Spinning or tapping them sets them, and pressing the hub starts. Zero form fields on any form factor; this extends mockup 01 B/C.
2. **Instant re-test from the URL.** `/?isp=link3&area=banani` preselects everything. Every "Test your X" / "Test from Y" CTA, every share link and the PWA shortcut become one-tap tests.
3. **A dither "signal" readout while the test runs.** Drive `<dither-art mode="stream">` density from the live Mbps, so the backdrop visibly thickens as speed rises. The dither becomes data, not decoration.
4. **The result becomes a place.** After landing, the pin spawns a tiny dot-matrix flag with your speed, and neighbours' recent pins briefly pulse around it ("3 people near you on NET Express: 38–45 Mbps"), which puts the peer comparison on the map instead of in a sentence.
5. **District pages as mini-maps.** Each `/district/<slug>` opens with its outline in dither dots and lit dots where tests exist, plus a "Be the first in Bandarban" GO. That gives 64 pages a unique hero instead of a table.
6. **Peak-hour mode.** A night toggle (auto after 8 pm Dhaka time) recolours the map with peak-only medians and a moon chip, making the "peak vs off-peak" story the site already computes visible at a glance.
7. **Package fit meter.** On the result, show "You pay for 50, you got 42" as a second needle ghosted on the dial, using the package picked in the one-tap review. One glance answers "am I getting what I pay for?".
8. **Offline-friendly share card.** Render the share PNG with the map snapshot and GO dial (as the OG image already does) and attach the URL, so WhatsApp previews show the brand art.

---

## Mockups

All 13 are under [`mockups/`](mockups/), built by `mockups/_src/build.mjs` from the site's tokens (Space Grotesk, Doto, Geist Mono, ink `#191a23`, lime `#b9ff66`, 5 px hard shadows, dither dots). Each file shows three options side by side; the recommended one is outlined.

| # | Item | Recommended | Why (one line) |
|---|---|---|---|
| 01 | [Start flow](mockups/01-start-flow.html) | C · ask only what's missing; the answer starts | GO + 1 tap without guessing the connection |
| 02 | [Provider & detection](mockups/02-provider-detection.html) | A · detected chip, quiet Change | Four elements become one line, and no hiding filter |
| 03 | [Connection & gpfi](mockups/03-connection-fwa.html) | A · preselected "5G router" tile | Fixes the silent "won't count" outcome with zero taps |
| 04 | [Result reveal](mockups/04-result-reveal.html) | A · dial holds the result + satellites | No backwards sweep; every number above the fold |
| 05 | [Review](mockups/05-review.html) | B · tap a star = posted | One-tap rating, and nothing lost on navigation |
| 06 | [Location fallback](mockups/06-location-fallback.html) | A · nearby area chips | Works without a map or GPS; one tap |
| 07 | [District pages](mockups/07-district-directory.html) | A · local first, nationwide folded | Answers "who serves my district?" in one screen |
| 08 | [Directory search](mockups/08-directory-search.html) | A · instant filter + card rows | No reloads, no sideways tables |
| 09 | [ISP page](mockups/09-isp-page.html) | A · measured first, directory folded | Leads with what only WifiRank knows |
| 10 | [Map on phones](mockups/10-map-mobile.html) | A · peek sheet | Every tap gets visible feedback in place |
| 11 | [Share](mockups/11-share.html) | A · popover with live preview | The link people actually paste, with the card art |
| 12 | [Hero legibility](mockups/12-hero-legibility.html) | B · dither mask | Fixes legibility with the brand's own effect |
| 13 | [Running card](mockups/13-running-card.html) | B · live readouts by stage | A useful scoreboard instead of advice text |

---

## Appendix A: data checks

```js
// node -e '…' in the repo root
const d = require('./data/isps.json');
d.filter(i => /^[A-Z]{1,3} M[\/\\]s\.?\s/i.test(i.name)).length;        // 112
d.filter(i => / t\/a | trading as /i.test(i.name)).length;               // 16
d.filter(i => /-caf(-|$)/.test(i.slug)).length;                          // 15
d.filter(i => !i.nationwide && !i.districts.length).length;              // 638
// Accent-only duplicates: normalise NFD, strip diacritics and non-alphanumerics, group by name → 4 pairs
```

## Appendix B: environment notes

- **Location data written to production:**
  - Simulator location was set to Dhaka (`23.7509, 90.3934`) for the iOS run.
  - The Android emulator was set to `23.7937, 90.4125`; location was then denied and the pin placed by tap.
- **Devices:**
  - iPhone 17, iPhone 17e and Pixel_API_36 were held by agent-device sessions from other threads (created 01:35–02:17 local).
  - emulator-5556's lease (02:19) was stale with the launcher in the foreground, so it was driven with plain `adb` to avoid disturbing any live session.
- **Videos:** compressed to ≤960 px, 24 fps, CRF 31 (32 MB total evidence).
