# Kegelee video ads for Instagram and Facebook

Six finished video ads in the app's black-and-white look: the KE logo,
Archivo type and the training circle. Each one has an AI voiceover from
ElevenLabs and AI sound effects. This folder also has scripts for more ads
you can film on a phone with free tools.

## The six ads

| # | File | Length | Voice | Hook |
|---|------|--------|-------|------|
| 1 | `videos/01-invisible-*` | 18s | Alpha | "I'm working out right now." It's a deadpan joke with a payoff: "and nobody can tell". |
| 2 | `videos/02-trythis-*` | 25s | Jeremy (calm coach) | "Try this right now." Viewers do a Kegel along with the circle, which keeps them watching. |
| 3 | `videos/03-legday-*` | 19s | Alpha | Chest day ✓ Back day ✓ … Pelvic floor ✗. This one has a white background so it stands out in a feed. |
| 4 | `videos/04-screentime-*` | 18s | Alpha | "Four hours of screen time" vs "this takes 3–5 minutes". |
| 5 | `videos/05-stamina-*` | 16s | Alpha | "The muscle that makes you last longer." Then: more stamina, more control, better in bed. |
| 6 | `videos/06-muscle-*` | 17s | Grant (deep) | "Stamina is a muscle. Most guys never train it." Then: last longer, perform better. |

Ads 5 and 6 use different voices on purpose, so you can test which voice works
better. Ads 5 and 6 also carry a policy risk; read "Ads 5 and 6 and Meta's
rules" below before running them.

Each ad comes in three files:

- `*-9x16.mp4`: 1080×1920 for Reels and Stories. This is the main file to upload.
- `*-4x5.mp4`: 1080×1350 for the Instagram and Facebook feeds. It's a crop of the same video.
- `*-cover.jpg`: the cover or thumbnail frame.

All text sits inside the area that Reels/Stories buttons and the 4:5 crop don't
cover.

## Sound

The voiceover is timed phrase by phrase, so each line is spoken as its words
appear on screen. Under it:

- a deep bass hit when big words land (an ElevenLabs sound effect)
- a whoosh as the phone slides up (an ElevenLabs sound effect)
- ticks on the countdown, and a chime on the end card

**There is no music.** ElevenLabs can't generate music through this
connection. Add a track in CapCut or in Ads Manager and keep it quiet, around
15–20% volume, so the voice stays clear:

- **Meta Sound Collection** (free and cleared for ads): Meta Business Suite →
  Content → Sound Collection. You can also pick a track in Ads Manager when you
  build the ad.
- **CapCut** (free): import the MP4, then Audio → Sounds. Use only tracks
  marked for commercial use.

Don't use popular Instagram songs: they aren't licensed for ads, so the ad
gets muted or rejected.

**Before you spend money, listen to the end of each ad** and check that the
voice says "Kegelee" the way you say it. The AI picked its own pronunciation.
If it's wrong, I can redo that line.

## Uploading in Meta Ads Manager

1. **Fix tracking first.** The app has no Meta SDK and no attribution tool
   (AppsFlyer, Adjust and so on), so Meta can't see installs or trial
   starts. Until one is added, run a **Traffic** campaign that sends people
   to the store listing. Once the SDK is in, switch to an **App promotion**
   campaign optimized for installs, or better, for trial starts.
2. Create one ad set for ads 1–4. Choose ages 18+, Advantage+ audience and
   Advantage+ placements. Put ads 5 and 6 in a **separate** ad set (see below).
3. Create one ad per video. In the ad, use **"Customize media per placement"**:
   upload the 9×16 file for Stories and Reels and the 4×5 file for Feeds.
4. Paste the copy for that ad (below). Set the button to **Install now** (or
   **Download**).
5. Turn off Meta's automatic "enhancements" that add music or change the text.
   They clash with the voiceover.

### Copy for each ad

Each ad has a main text, a headline and a description. Test two main texts
per ad.

**01 – Invisible workout**
- Main text A: `I'm working out right now. You can't tell. That's the point. 3–5 minute guided Kegel sessions you can do anywhere 🤫`
- Main text B: `The only workout you can do in a meeting. Kegelee guides you with a simple circle: squeeze, hold, relax. Free to start.`
- Headline: `The workout nobody sees`
- Description: `Free to start`

**02 – Try this**
- Main text A: `Did you do it? 👀 That was a Kegel. Now imagine 3–5 guided minutes a day.`
- Main text B: `Most people never train this muscle. Kegelee makes it a daily habit: guided sessions, 5 levels, streaks.`
- Headline: `Your daily Kegel coach`
- Description: `Free to start`

**03 – Leg day**
- Main text A: `Chest ✅ Back ✅ Legs ✅ Pelvic floor ❌ The muscle every training split forgets.`
- Main text B: `Your training split has a gap. 3–5 minutes a day, guided, with your hold time tracked week by week.`
- Headline: `Train the muscle everyone skips`
- Description: `5 levels · 3–5 min a day`

**04 – Screen time**
- Main text A: `4 hours scrolling. 5 minutes for this. Guided Kegel sessions, reminders and streaks, all in one app.`
- Main text B: `You spend more time on this feed than this workout takes. 3–5 guided minutes a day.`
- Headline: `3–5 minutes. Every day.`
- Description: `Free to start`

**05 – Stamina**
- Main text A: `Not your abs. Not your arms. The muscle behind your stamina is your pelvic floor 💪 3–5 minutes a day, guided, completely private.`
- Main text B: `More stamina. More control. Train the muscle that actually matters, 3–5 minutes a day. Nobody has to know.`
- Headline: `Stronger where it counts`
- Description: `Free to start`

**06 – Stamina is a muscle**
- Main text A: `Stamina is a muscle. Most guys never train it. Kegelee guides you 3–5 minutes a day and tracks your hold as it climbs 📈`
- Main text B: `Last longer. Feel stronger. A guided pelvic floor workout that takes 3–5 minutes a day.`
- Headline: `Train your stamina`
- Description: `Free to start`

## Ads 5 and 6 and Meta's rules

Meta's ad rules don't allow ads that focus on sexual performance. Lines like
"last longer", "better in bed" and "perform better" are what its review looks
for. Expect one of three outcomes:

- The ad is approved.
- The ad is approved but its delivery is limited.
- The ad is rejected.

What to do about it:

- Run 5 and 6 in their own ad set, so a rejection doesn't hold up ads 1–4.
- If one is rejected, you can request a review once. If it's rejected again,
  stop: repeated rejections can get the ad account restricted, and that would
  take ads 1–4 down too.
- The written copy above for 5 and 6 avoids the bedroom words on purpose.
  The video carries them, so the text doesn't add to the risk.
- Ads 1–4 follow the rules: no sex claims, no telling viewers they have a
  condition, and no medical promises.

All six ads should target ages 18+.

## More ads to film yourself (free, phone + CapCut)

Ads filmed by real people on a phone (called UGC, "user-generated content")
often get more installs than animated ones. Film with the front camera,
upright, in natural light. Add captions with CapCut → Text → Auto captions,
using a bold white font with a black outline. For the app shots, record your
own phone screen during a real session. Add an end screen by cutting in the
last 3 seconds of any ad above.

**A. "The meeting" (no talking, about 10s)**
- Shot: you on a video call or at a desk, staring at the camera, face
  completely still. Squeeze subtly.
- On-screen text: `me doing kegels in the meeting` → (3s) `nobody knows` →
  cut to a screen recording of the app circle → end screen.

**B. "Guess what I'm doing" (two people, about 12s)**
- A: "Guess what I'm doing right now." B (stares): "...nothing?" A: "Exactly."
- Cut to the app circle. Text: `3–5 min a day. Nobody can tell.` → end screen.

**C. Green-screen explainer (talking, about 20s)**
- In CapCut, use Cutout → Remove background, and put the app screen recording
  behind you.
- Script: "This is the one muscle almost nobody trains: your pelvic floor.
  It's behind your control and your stamina. Training it takes three to five
  minutes. This app runs the session for you. Follow the circle, squeeze,
  hold, relax. It even measures how long you can hold, so you can see it go
  up. Link's right there."

**D. "Day 1 vs Day 30" (talking, about 15s)**
- Show your **real** hold measurement from the app's Progress tab on day 1 and
  again 30 days later. Never fake the numbers: made-up results break Meta's
  rules and people notice.
- Script: "Day one I could hold for 3 seconds. Day thirty…" (show the
  number) "…three to five minutes a day, that's it."

**E. "Things I wish I knew sooner" (talking, about 20s)**
- Works for the women's market. Say it in the first person.
- Script: "Three things I wish I'd known about my pelvic floor sooner. One:
  it's a muscle, and it trains like one. Two: you're probably squeezing your
  butt instead. Belly, butt and thighs should stay relaxed. Three: it takes
  a few minutes a day. I use an app that counts it out for me."

You can voice any of these with ElevenLabs instead of on camera. Use the same
voices as the finished ads (Alpha, Jeremy, Grant) so all your ads sound like
one brand.

### Hooks to try (put them in the first 1–2 seconds)

1. I'm working out right now.
2. The one muscle every training split skips.
3. Try this. Nobody will notice.
4. The muscle that makes you last longer isn't your abs.
5. 4 hours on your phone. 5 minutes for this.
6. Stamina is a muscle. Train it.
7. Leg day ✓ Pelvic floor day?
8. POV: you found the laziest workout that actually exists.
9. Don't squeeze your butt. Squeeze *this*.
10. A workout with no gym, no gear and no sweat.
11. 3–5 minutes. Every day. That's the whole plan.
12. Everyone's heard of Kegels. Almost nobody does them right.
13. I did this every day for 30 days. *(only if true)*
14. Stop scrolling for 10 seconds and do this with me.
15. Most guys train everything except this.

### Getting more ideas from ChatGPT (free)

Paste this:

> I'm advertising Kegelee, a pelvic floor (Kegel) training app: guided 3–5
> minute daily sessions with an animated circle (squeeze, hold, relax), 5
> levels, reminders, streaks, and a hold-time tracker. Free to start, Premium
> has a 3-day trial. Write 20 scroll-stopping hooks (max 8 words each) and 5
> full 15-second Reels scripts with a voiceover line and on-screen text per
> second. Tone: bold, funny, deadpan. Audience 18+.

Then ask: "Make 10 more like #3 and #7", using the hooks that worked best.

### Free tools

| Tool | Use it for |
|------|------------|
| **CapCut** (desktop or phone) | Editing, auto captions, background removal, commercial-use music |
| **ElevenLabs** | Voiceovers and sound effects (the finished ads use it) |
| **Canva** (free plan) | Quick variations: swap a hook on a still frame, resize to 1:1 |
| **ChatGPT** | Hooks, scripts, ad copy variations |
| **Meta Sound Collection** | Music that's cleared for ads |
| **Phone screen recorder** | Real footage of the app (the most convincing shot you have) |

## Testing and scaling

- Start with ads 1–4 in one ad set and 5–6 in another, at **$15–20 a day**
  each. Let them run for 3–4 days without changes so Meta can learn.
- Check two numbers in Ads Manager (Columns → Customize → Video):
  - **Hook rate** = 3-second video plays ÷ impressions. Aim for over 30%.
    If it's lower, the first second isn't working, so change the hook.
  - **Hold rate** = ThruPlays ÷ 3-second plays. Aim for over 15%. If it's
    lower, the middle of the ad is losing people.
- Turn off anything costing twice as much per result as your best ad. Make 2–3
  new versions of the winner: same structure, new hook or new first scene.
  Fresh ads stop audiences getting bored of the same video.
- Once you can measure trial starts, judge ads by **cost per trial**, not
  cost per install. A cheap install that never subscribes doesn't help.

## Changing the videos

The ads are built from `source/ads.html`: the text, timings and screens are all
in the `ADS` object there. To see one frame in a browser, open
`ads.html?ad=invisible&t=1.2` through any local web server. Add `&guides=1` to
show the safe zones.

The voiceovers are in `source/vo/`, one ElevenLabs take per ad, and the two
sound effects are in `source/sfx/`. Each take is recorded with a long pause
between lines. The renderer cuts the take at its pauses (`source/vo.py`) and
places each phrase at the time listed in that ad's `vo.at`. To use a new
take, save it over the old one, then run `python3 source/vo.py take.mp3 0.3`.
That lists the phrases it finds; give `vo.at` one time per phrase.

To render the videos again:

```sh
node marketing/ads/source/render.mjs            # all six
node marketing/ads/source/render.mjs stamina    # just one
```

This needs Node with Playwright, ffmpeg, and python3 with numpy. The script
writes to `marketing/ads/videos/`.
