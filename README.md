# Planner+

A planner for [Lost City](https://2004.lostcity.rs) (2004scape), made to run as a
[LostKit](https://github.com/LostHQ/LostKit-Electron) tool: goals with a calculator for every skill,
monsters and their loot, your bank, and market prices, with the hiscores alongside.
Formerly Skills+ (and before that Hiscores+).

**Open it:** <https://im-hari-potter.github.io/planner-plus/>

Every number is the game's own, read from Lost City's server files: levels, XP, what each way to
train takes and makes, monsters' stats and drop tables. LostHQ's calculators and NPC database are
what those are checked against; where the two differ, the server wins.

- [What it does](#what-it-does)
- [Getting started](#getting-started)
- [Lookup](#lookup)
- [Goals and Plan (Calculator)](#goals-and-plan-calculator)
- [Important: choose what you actually use](#important-choose-what-you-actually-use)
- [Use my bank](#use-my-bank)
- [Round up my supplies](#round-up-my-supplies)
- [Prices and gp](#prices-and-gp)
- [Your bank, and reading it from screenshots](#your-bank-and-reading-it-from-screenshots)
- [Combat, monsters and loot](#combat-monsters-and-loot)
- [Useful tips](#useful-tips)
- [Skill by skill](#skill-by-skill)
- [Technical notes, development and credits](#technical-notes-development-and-credits)

## What it does

You set a goal, Planner+ works out what it takes. It starts from your XP on the hiscores, uses
what's in your bank first, and prices everything with market prices (or yours). Then it shows
what's still to do, what to collect or buy, and what it all comes to in gp.

| Tab | What it's for |
|---|---|
| **Lookup**, **Compare**, **Gains**, **Leaderboard** | The hiscores: any player's levels, XP, rank and Top %; players side by side; XP gained since last time; any skill's rankings. |
| **Goals** | Your goals, each with its **Plan (Calculator)**: every skill (Ranged with the ammo it takes), your total level, your combat level, and Slayer (a plan of kills and their loot). |
| **Bank** | What you have, typed in or read from screenshots: every item in the game, valued. Plans use it first. |
| **Prices** | The price each item uses: the market's, high alch, or your own. |
| **NPCs** | Every monster: its picture, its stats, where it is (with a minimap), the XP of a kill and every drop with its chance. |

The tabs stay at the top of the window as you scroll, each with its own icon. An item's name,
anywhere, takes you to its price on the Prices tab. Click a column's name to sort a table by it, and
again for the other way round.

## Getting started

1. **Add it to LostKit.** Click **Add tool** and enter `im-hari-potter.github.io/planner-plus`. The
   name and icon fill themselves in. (Added it back when it was Skills+ or Hiscores+? Right-click
   the tool, **Edit…**, and put in the new address. Your goals, bank and prices stay: they're kept
   in LostKit, not on the site.)
2. **Open Goals and enter your username** under *Planning for*. Your XP comes from the hiscores.
   Each account has its own goals and bank, so alts can have theirs.
3. **Put in your bank** (Bank tab): type amounts in, or read them from screenshots.
4. **Look over Prices** for the items you'll use (see [Prices and gp](#prices-and-gp)).
5. **Set a goal and open its Plan (Calculator).**

Everything is kept in your own browser (LostKit's). **Settings** (the cog) makes a backup to
restore or move it.

## Lookup

![Lookup: every skill's level, XP, rank and Top %](readme-1-lookup.png)

*Lookup: a player's levels, XP, rank and **Top %**, worked out as their rank among everyone ranked
in that skill.*

- Sort the tiles by level, XP, rank or Top %, or drag them into your own order. **In-game** lays
  them out as the game's own skills tab: three across, Total level along the bottom.
- **Combat** shows the combat skills, your combat level by the game's own formula, what the next
  level takes, and a calculator to try other levels.
- Once you have goals, a tile's bar is your progress toward its goal, and its goal line takes you
  to that goal on the Goals tab. A rank or top % goal's line says the XP to go too: what passes
  whoever holds that rank, as the goal's plan worked it out.
- Click a tile to pick it out in gold (Overall is, till then).
- The names you look up are kept under **Recent**; ✕ takes one off. The last player you looked up
  is there again whenever the tab opens.

**Compare** puts up to 5 players side by side, **Gains** shows what someone gained since last time
(a day, a week, a month), and **Leaderboard** any skill's hiscores with Top % beside every rank.

![Compare: up to 5 players side by side, the best in each skill highlighted](readme-15-compare.png)

*Compare: each skill's best highlighted; switch between levels, XP, ranks and Top %, and click a
name to sort the skills by that player's.*

## Goals and Plan (Calculator)

![Goals: set a goal, then your goals with their plans](readme-2-goals.png)

*Pick a skill (or your total level, your combat level, or Slayer), then what to reach. Each goal
sits under **Your goals** with its progress since you set it, and its **Plan (Calculator)**.*

- A goal is a **level, XP, rank or top %**. A rank or top % goal means beating whoever holds it
  now, and is checked again as they train. **Edit** moves the goalpost and keeps the rest.
- **Total level** is a goal too (the first button): a total level, total XP, an Overall rank or a
  top %. Its plan says what your skill goals add (rank and top % goals too, at the level that beats
  whoever holds that rank now), then the least XP that gets the rest, a level at a time: low
  levels are cheap. Untick a skill under **Train** that you won't train. **set a goal** turns a line
  into a skill goal, and **make your goal 80** changes the goal you have in that skill, whatever
  kind it is. A rank or top % goal works toward a level more than whoever holds that rank (Overall
  ranks by total level, then XP).
- **Combat level** is the second button. Its plan says what each kind of level takes to get there,
  with the combat calculator under it.
- **Slayer** isn't in this version of the game yet; here it's the home of monster plans. See
  [Combat, monsters and loot](#combat-monsters-and-loot).
- Move a goal up or down, to the very top or bottom (the arrows with a bar), or drag it by its
  name (the dots at its start). Filter your goals: in progress or reached, and by skill. Each
  skill's button shows its goals or leaves them out, as many as you like (with none on, every goal
  shows); Total level, Combat level and Slayer have buttons of their own. **Every skill** shows
  them all again. Tick **One at a time** for one skill's goals at a time.
- A goal you set is added at the bottom, and you're taken to it: **One at a time** is ticked with
  its skill's button on, so its skill's goals are the ones shown.

**Plan (Calculator)** opens a goal's plan, in three parts:

1. **From your bank**: what the items in your bank make, best XP first, with steps on the way
   counted (unfinished potions, gems cut for jewellery, bars smelted for smithing).
2. **Then, to reach your goal**: the rest, made the way you pick under **Train with**, with what to
   collect or buy and what it costs and makes.
3. **Every option**: the calculator, a table of every way to train, side by side. Click a row to
   train with it, or a column's name to sort by it.

How many you need is the XP still to go ÷ the XP each one gives, rounded up. Everything is done in
tenths of XP, the way the game keeps it.

![A Total level goal: what your skill goals add, then the least XP for the rest](readme-10-total.png)

*A Total level goal: your skill goals' levels first, then the cheapest levels for the rest.*

## Important: choose what you actually use

![The Use column: every option is on until you untick it](readme-3-use.png)

*The **Use** column, first in the table. Every option starts ticked: untick what you won't make.*

Every skill's table starts with a tick box. Where a plan uses your bank it's **Use**; elsewhere a
word for what the skill does with a row: **Chop**, **Mine**, **Catch**, **Steal**, **Run**,
**Fight**. Untick a tree you won't chop or a monster you won't fight, and the plan leaves it out.

The bank plan makes everything it can from your bank. **Every option starts out ticked**, so it
will spend your supplies on anything that uses them, even things you'd never make. **Untick what
you won't make.** Otherwise From your bank, Still needed and the gp totals count XP you won't get.

For example: 2,500 irit, 2,023 eye of newt and 477 unicorn horn dust in the bank. Super attack
gets the irits first, and the 477 left over become Superantipoison. Don't want Superantipoison?
**Untick it**, and those 477 irits stay in your bank for Super attack: of the 2,305 Super attacks
still needed (see below), you collect 1,828 irits instead of 2,305.

- An unticked option also leaves the **Train with** list, and the levels on the way to it. Click
  an unticked row to train with it, and it's ticked again.
- **Hide unticked items** (above the table; *Hide unticked fish*, *loot*, *skills*… as the table
  has it) takes the unticked rows out of every table with ticks: it's one switch.
- What a ticked row needs is still made on the way: untick Sapphire (cut) and the sapphires for
  your games necklaces are still cut. To leave uncut sapphires alone, untick what's made of them.

## Use my bank

![Use my bank on: From your bank, then what's still needed](readme-4-use-my-bank.png)

*Use my bank on: your bank first (its value is a gross: the supplies are already yours), then
what's still needed after it, and the supplies to collect or buy.*

Herblore 74 → 78, training with Super attack:

- **Use my bank off**: the plan starts from scratch, as if your bank were empty. **4,328** Super
  attacks to the goal, with every supply bought.
- **Use my bank on** (the default): your bank goes first. It makes **2,023** Super attacks, and
  **2,305** are still needed after them, with the supplies they take (less what's left in your
  bank). What your bank makes is shown as **Gross**: the supplies are already yours, so nothing is
  taken off for them.

With Use my bank off you can plan a mix of your own instead: type how many of each you'll make in
the table's **Plan to make** column, and the rest of the goal is planned after it.

Your bank goes to the best XP first, and where two potions want the same herb, the more useful one
gets it (Super attack before Superantipoison, Prayer potion before Fishing potion). Drag the lines
under From your bank to put your own first; **Back to the usual order** undoes it.

## Round up my supplies

![Round up my supplies, off and on](readme-5-round-up.png)

*Off, your bank as it is; on, rounded up so nothing is left over, with what to collect.*

**Round up my supplies** is a second view of your plan: what your bank would make if you collected
just what it's short of.

- 605 kwuarm and 518 limpwurt root make **518** Super strength. 87 kwuarm are left over.
- Round up my supplies: collect **87 limpwurt root**, and the same bank makes **605**.

Your most plentiful ingredient decides how many. It rounds up what your bank already makes, then
anything that's one ingredient short (irit with no eye of newt, bows cut but not strung). Cheap
things never hold it back: vials of water and thread, the runes a spell on the way takes, a ring of
forging. The table shows both views side by side: **Round up my supplies** says what to collect
for each row and what your bank makes of it then.

## Prices and gp

![Prices: the market's, high alch, or your own](readme-7-prices.png)

*Each item uses one price, and it sticks: the market's, high alch, or one you type.*

Costs, gross, net and gp per XP are only as good as the prices behind them. **Look over the Prices
tab for the items you'll use, and pick or type the price that's right for you.** Anything without
a price shows **?** until it has one.

- **Market** (the default): the median of recent sales on
  [markets.lostcity.rs](https://markets.lostcity.rs), otherwise of open offers. Nobody trading it,
  or it can't be traded? Its high alch value.
- **High alch**: what High Level Alchemy gives, 3/5 of its value, the game's own sum (a few quest
  items the spell refuses are worth nothing that way).
- **Your price**: type one in, and it's used until you pick another.
- Switch a whole skill or one list at once. **All** has every item the planner prices once, under
  the skill it first belongs to; **Gear** has every weapon and piece of armour, **Rares** the rares,
  and **Other** everything else you have. Click a column's name to sort the lists by it.
- **Find any item** searches every item in the game by name, whatever the tab.
- **Qty**: type how many you want, and **Cost** says what they cost. Or type what you'd spend under
  Cost, and Qty is how many that buys, rounded down (325K of chaos runes at 190 each: 1,710).
  **Your list** adds up everything with a quantity (**Show only these** lists just them), for
  planning what to buy.

**A price is both what a supply costs you and what a product is worth.** Say you mined your own
coal and set its price to 0: smithing steel bars from it now shows almost pure profit. But that coal
would sell at the market's price, and using it for bars means not selling it. Leave coal at the
market's price and the plan shows that value too, so you can see whether the bars are worth more
than the coal and ore you put in.

- **Gross**: what something is worth, nothing taken off. Your banked supplies are counted this way:
  they're yours already.
- **Net**: worth less what its supplies cost, so it can be negative.
- **gp/XP**: what each XP costs you (negative: you make money doing it).

Market prices are checked one at a time and kept for 12 hours. Click an item's name anywhere to
see its price here; here, a name opens it on the market (inside LostKit it opens in the tool's tab;
◀ comes back).

## Your bank, and reading it from screenshots

![Reading the bank from a screenshot: what was read, before anything changes](readme-6-bank-import.png)

*What was read from your screenshots, to check before anything changes. A stack that looks exactly
like another item gets a drop-down.*

- Type what you have: `1500`, `1.5k` and `2m` all work. Items sit eight to a row, as in the game's
  bank, each with what one is worth (**ea**) and what yours come to. **All** has everything you
  have: in your bank's order, by value, or by skill.
- The buttons after All pick items out: **Gear** your weapons and armour, **Rares** the rares (every
  one, to type in), each skill the items its plans use, and **Other** what none of them lists, in
  sections (jewellery, ammunition, tools, food…). They're filters, so a rune platebody is under
  Gear and Smithing alike; All counts it once. Gear and Other add any item by name too.
- **Read it from screenshots**: open your bank in LostKit and press the screenshot key (scroll and
  take more if it doesn't fit). Drop the pictures from *Pictures › LostKit Screenshots* on the
  Bank tab, paste one, or **Choose screenshots**.
  - It reads the picture the way the game drew it: icon outlines and colours say which item is in
    each slot, and the yellow numbers how many. Every item in the game is known, tools and quest
    items too. Overlapping screenshots don't count twice.
  - Some items look exactly like another (soda ash and ashes, big bones and jogre bones, a sapphire
    ring and a ring of recoil): pick which from the drop-down. Your pick is kept for next time.
  - Amounts of 100K and up are rounded on screen (`150K`): an amount you entered that fits is kept.
  - Only the ticked lines change your bank. **Hide the items that stayed the same** leaves just
    what changed, to check.
- **Slayer** has a tab of everything monsters drop, by kind (runes, weapons, armour, gems, herbs,
  bones…). Items a skill uses too are on that skill's tab as well: it's one bank.
- Everything is valued: by the market, high alch or your own price (Prices tab). An item that
  can't be traded is worth its high alch.

![The bank: eight items to a row, each with what one is worth and what yours come to](readme-12-bank.png)

*Eight to a row, as in the game: what one is worth (ea), and what yours come to.*

## Combat, monsters and loot

**Attack, Strength, Defence, Hitpoints and Ranged** are trained on monsters: a row is a monster, and
a plan counts kills. A kill is the monster's hitpoints in damage, and every point of damage gives
XP by your style, the server's own sum: 4 XP to the style's skill (Controlled: 1.33 to each of
Attack, Strength and Defence; Longrange: 2 to Ranged and Defence), and 1.33 to Hitpoints whatever
the style. With no monster picked, a plan trains on the one with the most XP a kill among those no
more than half your combat level. Each plan says what its kills give besides, a row for each skill
with its icon (Hitpoints XP, and Prayer XP if you bury the bones), and what its goal adds to your
combat level.

### Ranged: the ammo a plan takes

![A Ranged goal's ammo: what you shoot with, each monster's shots, and what's fired, lost and costs](readme-16-ammo.png)

*A Ranged goal's ammo: each monster's shots as your Ranged rises, then what's fired, lost and what
it costs.*

A Ranged goal's plan counts the ammo its kills take, by the server's own sums. Pick **arrows** (and
the bow you fire them from), **knives** or **darts**; it starts with the best your Ranged level can
use. Then Rapid or Accurate, whether you **pick up what drops**, and your armour's Ranged attack.

- **Shots**: each shot is a roll, your attack against the monster's defence, and a hit does 0 to
  your max hit, so a kill takes as many shots as its hitpoints need on average. They're counted a
  level at a time as your Ranged rises, and the plan's table has a **Shots** column: a kill at your
  level now.
- **Fired, lost and what it costs**: every shot uses one, hit or miss. 1 in 5 breaks and the rest
  drop where the monster stands, so picking them up loses a fifth; leaving them loses them all.
- **Which kind?** It matters: arrows hit hardest, their strength the arrow's and their attack the
  bow's (rune arrows 49, a magic shortbow +69). Knives and darts have both themselves (rune knives
  +25 attack and 24 strength, rune darts +15 and 14), so a kill takes more of them. A bow fires
  arrows up to its level: rune arrows need a yew or magic bow. Knives and darts are thrown faster,
  which changes the time a kill takes, not its shots.

### NPCs: the monster database

![NPCs: every monster with the XP and loot of a kill](readme-9-npcs.png)

*Every monster, with the XP and the loot of a kill. Search by name or combat level, or browse by
level.*

The list has each monster's hitpoints and its Attack, Strength, Defence, Ranged and Magic levels
(faint where it doesn't attack that way); click a column's name to sort by it.

Click a monster for its page: its picture (LostHQ's render of the game's model), its stats and how
it fights, where it is (every place, the most first, with the Wilderness's levels), and a minimap of
the biggest group of them, drawn from the game's own map files the way its minimap is, a yellow dot
each. Then the XP of a kill in every style, and every drop with its chance a kill (as the drop
table has it: 1/128, 3/128…), how many a drop is, and the kills by which half of players have one,
and 9 in 10. Drops are worked out for a members world, from the server's own drop scripts. Tick
**Ring of wealth** or **Legends' Quest done**: both change the gem table.

![A monster's page: its picture, where it is, and a minimap](readme-14-npc-page.png)

*A monster's page: its picture, its numbers, where it is, and a minimap drawn from the game's map
files.*

### Slayer goals: a plan of kills

![A Slayer goal: kills done, XP, the loot to expect, your loot, and how lucky](readme-8-slayer.png)

*A Slayer goal: the XP of its kills and the level they take you to, the loot to expect, and, once
you've done some, your loot and how lucky that is.*

A Slayer goal is a monster and a number of kills. Make one from the Slayer button on Goals, with
**Plan kills** on the NPCs tab, or with **Plan the loot** on a monster's line in any combat skill's
plan: "1,992 × Fire giant" makes a Slayer goal of those 1,992 kills, in that goal's style (once made,
the line opens it).

Its plan has:

- **Kills done** (type them, or − and +), and the goal's progress. They're counted from your XP
  too: see below.
- **XP**: what the kills give each skill, and the level the ones still to do take you to; then,
  each with its skill's icon too, what burying the bones, alching and cleaning the herbs give.
- **Loot**: every drop with its chance a kill, how many to expect over your kills, the chance of at
  least one, and its **Expected value** at your prices.
  - **Take**: untick what you leave on the ground. It's worth nothing to you, and starts unticked
    when loot is read from screenshots. **Hide unticked loot** takes it out of the table.
  - **Alch**: tick what you high alch. It's counted at its high alch in coins (a fire battlestaff:
    9,300 each), goes into your bank as coins, and its casts' Magic XP and nature runes are counted.
  - **Herbs**: cleaned, each herb has its own chance (Ranarr weed 209/16,384 a fire giant); kept
    grimy, they're the one Unid herb.
- **Looted**: your loot, typed in, or − and + a drop at a time. After your kills, each drop says
  what's to be expected and how lucky you are ("luckier than 54%", "65% get more"), and its
  **Actual value**. Click a column's name to sort by it. **Banked** is how much of it is in your
  bank.
- **Dryness**: a drop you haven't had says how dry you are, and how many players go that dry.

**Kills from your XP.** When the hiscores show new combat XP, a box above your goals says how much:
**Choose what I killed**, or **Not now**. Every Slayer goal's monster is listed, and any other can be
added. Your topmost Slayer goal takes the XP to start with (the Hitpoints XP over a kill's: 1.33 a
point of damage, whatever the style); type the others' kills, and it takes what they leave, or
click **the rest** on another. XP from something else can be taken off a goal's kills, since a goal
for some XP needs fewer. The XP is counted since your last count; to count from further back, pick
one of your Gains snapshots instead. **Count kills from my XP…** in a plan opens it any time.

![New combat XP above your goals: choose what you killed, or not now](readme-11a-kills.png)

![Choose what I killed: your Slayer goals' monsters, one of them taking the rest of the XP](readme-11-kills.png)

*The new XP above your goals; then Choose what I killed: your topmost Slayer goal takes the XP the
others leave.*

**Loot, and your bank.**

- **Read loot from screenshots**: a screenshot of your inventory for each trip (your bank can be
  open). Only what the monster drops is read. Change any amount, or untick what wasn't from these
  kills; several screenshots of one trip count once (**They're all one trip**), and a screenshot
  you've added before isn't counted again. Nor is one taken before you set the goal, unless you
  tick it: what it shows was picked up before.
- **Alched on the way?** The coins in a screenshot are coins dropped and the coins alching made.
  When there are more than your kills drop, the review guesses what you alched (from the drop
  rates, the kills on those trips and what you tick under **Alch**), and you change it to what you
  did. What you alched counts as loot, alched; only the rest of the coins count as coins dropped,
  so the luck stays right. Untick the Coins line (coins you had already) and nothing alched on
  those trips counts either, nor the nature runes it took.
- **What you bring each trip** (runes, coins, arrows the monster drops too) is taken off each
  screenshot, so what you carry, and loot from before this goal, is never counted as loot.
- **Crystal keys**: for a monster that drops both key halves, a crystal key in a screenshot is the
  two halves you made it from on the trip, and counts as one of each. Then a deposit puts pairs of
  halves into your bank as crystal keys, and the rest as halves (untick **Pairs of halves go in as
  crystal keys** to bank them all as halves).
- **Add to my loot** counts it as these kills' loot. Your bank doesn't change till you deposit.
- **Deposit to my bank…** works from your loot: what isn't in your bank yet, after every trip, a
  few, or at the end. Change any amount first. What you alched goes in as the coins it made, and a
  nature rune for each cast comes out of your bank; nothing else in your bank changes.
- What it did is said in the plan itself, with **Undo**.

![Alched on the way: the coins a trip's screenshot shows, less what alching made](readme-13-alch.png)

*A trip's screenshot with more coins than its kills drop: what was alched, guessed from the drop
rates; the Coins line keeps only what was dropped.*

![How dry is dry, and reading loot from screenshots](readme-8b-slayer-dry.png)

*How dry is dry: any drop, any number of kills without it.*

A drop of 1/128 and 200 kills without it is 1.56 × the drop rate, and more to the point: **going
that dry happens to 21% of players**, about 1 in 5. Half of players have one by 89 kills, and 9 in
10 by 294.

## Useful tips

- **Untick what you won't make** (see above). It's the one thing that changes a plan the most.
- **Refresh XP** after a session: new combat XP is counted as your Slayer goals' kills.
- **Check the prices** of what a plan uses before trusting its gp.
- **Hide table** tucks one plan's table away, and **Hide all tables** every open plan's.
- A number you're typing is left alone until you enter it (Enter, Tab or a click elsewhere), so
  prices arriving meanwhile don't get in the way.
- Some items look exactly alike in this version (soda ash and ashes): screenshots ask which.
- After an update, press Ctrl+R once if something looks off: a browser can keep the last version's
  files for a few minutes.
- The numbers are the game's own, so a few may surprise you: achey logs give no Firemaking XP, any
  axe works at any Woodcutting level, Crumble Undead gives 49 Magic XP, and a point of damage is
  1.33 Hitpoints XP, not a third of 4.

## Skill by skill

<details>
<summary>What each skill's planner counts, and where the server and LostHQ's calculators differ</summary>

- **Herblore**: unfinished potions are made on the way. A potion waits for the more useful one its
  herb makes. **I'll buy vials of water as I go** (on at first) leaves vials out of costs. Every
  "Herb" in your bank is one Unid herb entry until identified.
- **Runecraft** counts in essence, with the runes each makes at your level (×2, ×3…).
- **Woodcutting**, **Mining** and **Fishing** don't use your bank: what to gather and what it's
  worth. A gem rock is its gems' chances; Mining can plan by the bar (a steel bar: 1 iron ore, 2
  coal). Fishing lists the gear and the bait or feathers to buy.
- **Firemaking** burns your bank's logs, best first. **Fletching** has bows, arrows, darts and
  bolts. **Prayer** buries bones from your bank, best first.
- **Crafting**: gems are cut, glass blown, wool spun and hides tanned on the way (the tanner's fee
  counted: Al Kharid or Canifis). Battlestaves are planned from soda ash and sand through molten
  glass, orbs and charging, each stage's XP counted. Key halves count as the crystal chest's
  dragonstone.
- **Smithing**: ore is smelted on the way. Buy bars, smelt them or superheat them; a ring of
  forging and goldsmith gauntlets are choices.
- **Cooking**: burnt food is counted by the server's own chances, a level at a time (cooking
  gauntlets and Lumbridge's range count). Pies, pizzas and cakes are put together on the way.
- **Thieving** counts thefts that work, by the server's roll, and loot at its price. **Agility**
  counts laps and the Agility Arena's tickets.
- **Magic**: your bank's runes go to the best teleport and combat spell they allow by themselves; a
  curse or alchemy waits until you pick it. Jewellery and orbs are made on the way; a staff stands
  in for its runes.
- Where LostHQ's calculators and the server differ, the server's number is used: a sapphire
  necklace is Crafting level 20 (not 22), Stun gives 90 Magic XP (not 80), Falador's crumbling wall
  12.5 Agility XP (not 0.5), and the server's own rows are added (limestone, monkey bones).

</details>

## Technical notes, development and credits

<details>
<summary>How it's built, how to run it, and where the data comes from</summary>

Plain HTML, CSS and JavaScript, with no build step for the site.

- `node --test` runs the unit tests. `node mock-server.mjs` serves the site with a fake hiscores
  API and a fake market at <http://localhost:8787/?api=local>, and `node e2e.mjs` runs the browser
  tests against it (needs Playwright).
- The game data is generated: `node build-data.mjs <Content checkout> <LostHQ 2004 checkout>`
  (needs `sharp`) writes `gamedata.js`, `npcdata.js`, `items.png`, `items-more.png`,
  `bankread-data.js`, `bankicons.png`, `npcpics.webp`, `npcmaps.webp`, and the app's icons
  (`build-icons.mjs`: `slayer.webp`, `tabicons.png`, `gear.webp`, `rares.webp`). Upload them
  together: the data names its pictures with a stamp of each.
  - Content is [LostCityRS/Content](https://github.com/LostCityRS/Content), branch 274: levels, XP,
    what everything takes and makes, item values, monsters, their stats and their drops.
  - [LostHQ/2004](https://github.com/LostHQ/2004) gives item names and icons, and the rows of its
    calculators (which ways to train there are). Every number in them is checked against the
    server's, and the build stops at any difference it hasn't been told about.
  - Drops: `build-drops.mjs` reads the server's drop scripts (`scripts/drop tables` and each NPC's
    death script) and follows every value a `random()` can take into a table of rows and chances,
    with the shared tables (herbs, gems, the rare drop table) as references. They're checked
    against LostHQ's NPC database; where the two differ (43 NPCs as of rev 274), the server's are
    used. What a monster leaves to bury is the server's too.
  - A monster's page (`build-npcmaps.mjs`): its picture is LostHQ's render of the game's model
    (`img/npc_spritesheet.png`, by the NPC's id); where it is comes from the server's map files
    (`maps/`: where each NPC stands, and the world map's names), and its minimap is drawn from
    them the way the client draws its own: the ground's colours blended, walls and doors, trees
    and rocks, and the map's icons. How it attacks (melee, ranged, magic, dragonfire) is read from
    its attack scripts.
  - Ranged ammo: a shot's rolls and max hit are the server's combat scripts' (`player_ranged.rs2`
    and the scripts it calls), and the bows', arrows', knives' and darts' bonuses, levels and the
    1 in 5 that break are read from its item configs and constants.
- Planner files: `planner.js` (the maths, in tenths of XP), `planner-ui.js` (Goals, Bank and
  Prices), `npc-ui.js` (the NPCs tab and Slayer goals), `loot.js` (drop chances, expected loot,
  luck and dryness, kills from XP), `ranged.js` (a shot's chance to hit, the shots a kill takes and
  the ammo a plan fires), `prices.js` (the market and high alch), `bankread.js`
  (reading the bank and the inventory from screenshots; `bankfake.mjs` paints pretend ones for the
  tests), `sortable.js` (dragging), `tablesort.js` (sorting a table by a column's name).
- The hiscores API allows one request every 2 seconds, so lookups queue up. It only lets its own
  website read it from a browser; LostKit's tool tabs are the exception, and a copy hosted on
  Netlify (see `_redirects`) works in any browser. A GitHub Action refreshes each skill's player
  count (for Top %) twice a day.

**Credits.** Hiscores from the Lost City hiscores API. Levels, XP, item values, monsters and their
drops, the maps, spell icons, and the bank layout and font the screenshot reader uses, from Lost
City's server content and client (MIT). Item names and icons, monsters' pictures, and the rows of
LostHQ's calculators, from [LostHQ](https://2004.losthq.rs) (GPL-3.0). Prices from
[markets.lostcity.rs](https://markets.lostcity.rs). Skill icons and RuneScape fonts from
[LostKit](https://github.com/LostHQ/LostKit-Electron) (GPL-3.0). The Slayer icon is the client's own
(from 2005, when the skill came); the tabs' icons are drawn in the frame of the client's round side
icons, and Gear's is its Worn Equipment icon.
RuneScape is © Jagex Ltd.

This is a fan project, not affiliated with Jagex, Lost City or LostHQ. Licensed under GPL-3.0.

</details>
