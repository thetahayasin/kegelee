# Google Ads campaign: YouTube → Google Play

One campaign that shows the five Kegelee ads on YouTube only and sends
people to the Play Store listing. It runs in English-speaking countries that
pay well, and never on Search or Display.

## Why Demand Gen and not an App campaign

Google's App campaigns are the only way to get placements inside the Play
Store, but they always run on Search, Display, YouTube and Play together.
You can't switch Search or Display off. **Demand Gen** with the
**App promotion** goal lets you pick the channels, so this campaign uses
YouTube Shorts, In-stream and In-feed only, with Google Play as the
destination.

If your account doesn't offer App promotion when you pick Demand Gen, stop
and tell me before using any other setup.

## Before you build it (one time)

1. **Link Google Play.** In Google Ads, go to Tools → Data manager → Google
   Play → Link, and approve the link in Play Console. This creates the
   **Android installs** conversion automatically, with no SDK needed. Also
   turn on **In-app purchases (Google Play)** and set it as a *secondary*
   goal, so it's tracked for reporting but not used for bidding.
2. **Upload the videos to YouTube** on your channel, as **Unlisted**. That's
   15 uploads: each of the five ads in 9×16, 1×1 and 16×9, from
   `marketing/ads/videos/`. Name them like `Kegelee – impress – 9x16`. Every
   ad uses some Vecteezy footage, so put `Footage: Vecteezy` in each
   YouTube description (the free license requires the credit).
3. **Currency.** Prices below are in USD. If the account was created in
   another currency, convert them.
4. **Content suitability** (Tools → Content suitability):
   - Inventory type: **Standard**.
   - Exclude: tragedy & conflict, sensitive social issues, profanity.
   - Exclude content types: live streams and embedded videos.

## Campaign settings

| Setting | Value |
|---|---|
| Type / goal | Demand Gen → **App promotion → App installs** |
| App | Kegelee, Android (`com.kegelee.app`) |
| Name | `Kegelee | DG | YouTube | Android | EN-T1` |
| Conversion goal | **Android installs (Google Play)** only (campaign-specific goal) |
| Bidding | **Maximize conversions**, no target CPA at first (see Phases) |
| Daily budget | **$50** |
| Dates | Start today, no end date |

## Ad group settings

| Setting | Value |
|---|---|
| Name | `Men 25-64 · Tier 1` |
| Channels | ✅ YouTube Shorts ✅ YouTube In-stream ✅ YouTube In-feed. ❌ Discover ❌ Gmail ❌ Display ❌ Maps |
| Locations | United States, United Kingdom, Canada, Australia, New Zealand, Ireland |
| Location option | **Presence: people in or regularly in** these locations. Not "interest in": that would let people in India or Pakistan see the ads by searching about these countries. |
| Language | English |
| Gender | Male only (untick Female and Unknown) |
| Age | 25–34, 35–44, 45–54, 55–64. Untick 18–24, 65+ and Unknown: 18–24 installs a lot but rarely pays. |
| Household income (US only, optional) | Top 50% |
| Optimized targeting | On |
| Audience signal | Custom segment "Men's fitness". Interests: *gym workout, bodybuilding, calisthenics, men's fitness, testosterone, self improvement*. People who use apps like: *Strava, Fitbod, Hevy, Nike Training Club, MyFitnessPal*. |

Don't put sexual-health or medical terms (ED, premature ejaculation and so
on) in the audience. Google's personalized advertising policy bans targeting
people on sexual health, and the ad group gets disapproved.

India and Pakistan aren't in the target list, so the ads never serve there.
Other low-paying English-speaking markets (Nigeria, the Philippines, Kenya,
Bangladesh) are left out for the same reason.

## Ads

One video ad per concept, so you can see which concept wins. Each ad gets
its three shapes (9×16, 1×1, 16×9), the logo
`marketing/ads/google/logo-1200.png`, business name **Kegelee**, call to
action **Install**, and this text. Limits: headline 40 characters, long
headline 90, description 90.

**Ad 1: Stamina is a muscle**
- Headlines: `Stamina is a muscle. Train it.` · `Last longer. Feel stronger.` · `Guided Kegel workouts for men`
- Long headline: `Stamina is a muscle. Most guys never train it. Download and start now.`
- Descriptions: `Guided Kegel workouts that track your control as it climbs.` · `Last longer, feel stronger, perform better. Download the app and start now.`

**Ad 2: Impress her**
- Headlines: `Want to impress her?` · `Forget the abs. Last longer.` · `Last longer in bed`
- Long headline: `It's not your abs. It's how long you last. Train the muscle that matters.`
- Descriptions: `Guided Kegel workouts for men. Last longer, stay in control.` · `Leave her impressed. Download Kegelee and start now.`

**Ad 3: How long do you last?**
- Headlines: `How long do you really last?` · `Stamina isn't luck` · `Go longer`
- Long headline: `Be honest. How long do you really last? Stamina is a muscle you can train.`
- Descriptions: `More stamina. More control. Guided Kegel workouts for men.` · `Track your control as it climbs. Download the app and start now.`

**Ad 4: Chest day**
- Headlines: `You train everything but this` · `The muscle you never train` · `Leave her speechless`
- Long headline: `You train your chest, arms and legs. Not the one muscle that matters in bed.`
- Descriptions: `Guided Kegel workouts that track every rep.` · `Last longer. Hit harder. Download the app and start now.`

**Ad 5: Round two**
- Headlines: `She wants round two` · `Round two? Easy.` · `Ready every time`
- Long headline: `She wants round two. Stamina is a muscle. Train it and be ready every time.`
- Descriptions: `More stamina. More control. Guided Kegel workouts for men.` · `Be ready every time. Download the app and start now.`

## Prices and thresholds

**Break-even cost per install (CPI).** After Google Play's 15% cut, the plans
net about $5.09 a month, $13.59 for three months and $50.99 a year. With
these assumptions:

- 20% of installs start a trial
- 40% of trials pay
- a paying user brings in about $33 net in the first year

each install is worth about **$2.60**. Replace these with your real numbers
from RevenueCat once you have them, and move the figures below with them.

| Threshold | Value |
|---|---|
| Target CPI | **$2.00** |
| Daily budget | **$50**. That's 25× the target; Google wants at least 15–20× for its bidding to learn. |
| Lowest workable budget | $30/day. Below that, cut the locations to US + UK. |
| Pause the campaign if | CPI is over **$4.00** after $250 spent |
| Pause an ad if | its CPI is **1.5× or more** the best ad's, once each ad has spent $40 or more |

### Phases

1. **Learning (days 1–7, or until 50 installs).** Maximize conversions with
   no target. **Change nothing.** Every edit restarts learning.
2. **Set a target.** Switch to **Target CPA = your actual average CPI from
   the last 7 days**. Never set it lower than that at first: a target far
   below reality stops delivery. Then lower it by about 10% a week toward
   $2.00.
3. **Scale.** While CPI stays at or under $2.00 for 5 or more days, raise the
   budget **20% every 3–4 days**. A bigger jump restarts learning.
4. **Refresh creative.** Pause losers by the ad rule above and keep at least
   two ads live. Add a new hook every 2–3 weeks; ads wear out.
5. **Check countries after $500.** Look at the Locations report. If a
   country's CPI is over 1.5× the average, exclude it or move it into its own
   campaign with a smaller budget.

### What actually counts

Installs are only the bidding signal; trials and payments are the result.
Every week, check in RevenueCat:

- **Install → trial rate.** Below 10% means the ads attract the wrong people.
  Narrow the age to 25–54 and pause the ad with the weakest trial rate.
- **Cost per trial** = spend ÷ trials. Aim for $10 or less.

When the app logs trial starts through Firebase, or the Google Play in-app
purchase conversion starts filling in, switch the campaign goal to trial
start, with a target CPA of about $10–12.

## Google's ad policy

Google's sexual health policy doesn't allow ads that focus on sexual
enhancement. Ads 2 to 5 ("last longer in bed", "better sex", "round two") are
likely to be disapproved or limited. Ad 1 is the mildest and the most likely to run.
If an ad is disapproved, appeal once. Repeated violations can get the
account suspended.
