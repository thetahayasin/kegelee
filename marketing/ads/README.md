# Kegelee video ads for Instagram and Facebook

Three video ads on the stamina angle. Each has an AI voiceover from
ElevenLabs in the same deep voice (Grant), plus AI sound effects. They're
black and white with bold Archivo type, to match the app.

| # | File | Length | Hook |
|---|------|--------|------|
| 1 | `videos/01-muscle-*` | 17s | "Stamina is a muscle. Most guys never train it." Then: last longer, feel stronger, perform better. |
| 2 | `videos/02-impress-*` | 17s | "Want to impress your girlfriend? Forget the abs. Forget the car. It's how long you last in bed." |
| 3 | `videos/03-howlong-*` | 20s | "Be honest. How long do you really last?" A stopwatch stops at 2:47. Then: more stamina, more control, better sex. |

Ads 2 and 3 are built for stock footage behind the text. A clip goes in each
slot listed in `source/stock/README.md`. Until a slot has a clip, it shows
the plain dark background.

Each ad comes in three files:

- `*-9x16.mp4`: 1080×1920 for Reels and Stories. This is the main file to upload.
- `*-4x5.mp4`: 1080×1350 for the Instagram and Facebook feeds. It's a crop of the same video.
- `*-1x1.mp4`: 1080×1080 for YouTube in-feed.
- `*-16x9.mp4`: 1920×1080 for YouTube in-stream. It shows the vertical ad over a blurred copy of itself.
- `*-cover.jpg`: the cover or thumbnail frame.

The Google Ads YouTube campaign (YouTube → Google Play only) is set out in
`google/campaign.md`.

All text sits inside the area that Reels/Stories buttons and the 4:5 crop don't
cover.

## Sound

The voiceover is timed phrase by phrase, so each line is spoken as its words
hit the screen. Under it:

- a deep bass hit when big words land
- a whoosh as the phone slides up
- ticks on the stopwatch and progress bars
- a chime on the end card

**Add music.** ElevenLabs can't generate music through this connection. Add a
track in CapCut or Ads Manager at about 15–20% volume, under the voice:

- **Meta Sound Collection** (free and cleared for ads): Meta Business Suite →
  Content → Sound Collection.
- **CapCut** (free): Audio → Sounds. Use only tracks marked for commercial use.

A dark, slow phonk or trap beat suits all three. Don't use popular Instagram
songs: they aren't licensed for ads, so the ad gets muted or pulled.

**Listen to the end card** and check that "Kegelee" is pronounced the way you
say it. If not, that one line can be regenerated.

## Uploading in Meta Ads Manager

1. **Tracking.** The app has no Meta SDK or attribution tool yet, so Meta
   can't see installs or trial starts. Until one is added, run a **Traffic**
   campaign that sends people to the store listing. Once the SDK is in,
   switch to an **App promotion** campaign optimized for trial starts.
2. Create one ad set targeting men, 18+, with Advantage+ placements.
3. Create one ad per video. Use **"Customize media per placement"**: the 9×16
   file for Stories and Reels, and the 4×5 file for Feeds.
4. Paste the copy below. Set the button to **Install now**.
5. Turn off Meta's automatic "enhancements" that add music or change the text.

**Expect review trouble.** Meta's rules don't allow ads about sexual
performance, and all three ads say it straight ("last longer", "better
sex"). Some may be approved, some limited, some rejected. If one is
rejected, request a review once. If it's rejected again, stop: repeated
rejections can get the ad account restricted.

### Copy for each ad

**01 – Stamina is a muscle**
- Main text: `Stamina is a muscle. Most guys never train it. 💪 Kegelee trains it with guided workouts and tracks your hold as it climbs.`
- Headline: `Train your stamina`

**02 – Impress her**
- Main text: `Forget the abs. Forget the car. It's how long you last. 🔥 Train the muscle that actually matters.`
- Headline: `Last longer in bed`

**03 – How long do you last?**
- Main text: `Be honest. How long do you really last? ⏱️ Stamina isn't luck. It's a muscle, and you can train it.`
- Headline: `Go longer`

Use `Free to start` as the description on all three. Test two main texts per
ad by swapping in a hook from the list below.

### Hooks to try (first 1–2 seconds)

1. Stamina is a muscle. Train it.
2. Want to impress your girlfriend?
3. Be honest. How long do you really last?
4. It's not your abs. It's how long you last.
5. The muscle that decides how long you last.
6. Most guys train everything except this.
7. She won't care about your bench press.
8. Last longer. Tonight's a good night to start.
9. The workout your girlfriend will thank you for.
10. 2 minutes isn't a flex.

### More ideas from ChatGPT (free)

Paste this:

> I'm advertising Kegelee, a Kegel (pelvic floor) training app for men:
> guided workouts with an animated circle, 5 levels, and a hold-time tracker
> that shows your control improving. The angle is stamina in bed: last
> longer, more control, impress your partner. Write 20 bold, scroll-stopping
> hooks (max 8 words each) and 5 full 15-second Reels scripts with a
> voiceover line and on-screen text per second. Tone: confident, cheeky,
> straight to the point. Audience: men 18+.

## Testing

- Run all three in one ad set at **$15–20 a day** for 3–4 days without changes.
- In Ads Manager (Columns → Customize → Video), check:
  - **Hook rate** = 3-second plays ÷ impressions. Aim for over 30%.
  - **Hold rate** = ThruPlays ÷ 3-second plays. Aim for over 15%.
- Turn off anything costing twice as much per result as the best ad. Make
  2–3 new versions of the winner with a new hook or a new first scene.

## Changing the videos

The ads are built from `source/ads.html`: the text, timings, screens and
stock slots are all in its `ADS` object. To see one frame in a browser, open
`ads.html?ad=impress&t=1.2` through any local web server. Add `&guides=1` to
show the safe zones.

The voiceovers are in `source/vo/`, one ElevenLabs take per ad, recorded with
a long pause between lines. The renderer cuts each take at those pauses
(`source/vo.py`) and starts each phrase at the time listed in the ad's
`vo.at`. After replacing a take, run `python3 source/vo.py take.mp3 0.3` to
list its phrases, then give `vo.at` one time per phrase.

Stock clips go in `source/stock/`; its README lists the slots. To render:

```sh
node marketing/ads/source/render.mjs            # all three
node marketing/ads/source/render.mjs impress    # just one
```

This needs Node with Playwright, ffmpeg, and python3 with numpy. The script
writes to `marketing/ads/videos/`.
