# bipinmaharjan7.com.np

Jekyll site for GitHub Pages. No build pipeline to configure — GitHub compiles Jekyll
natively on push.

## Change these first

Open `_config.yml` and edit:

| Field | What it does |
|---|---|
| `title`, `author.name` | Name shown in the header, footer, and page titles |
| `tagline` | Small text next to your name in the header |
| `contact.email` | Currently `you@example.com` — replace it |
| `contact.github` | Your GitHub username (leave `""` to hide the link) |
| `contact.scholar`, `contact.linkedin` | Full URLs, or `""` to hide |

Then check `index.html` and `about.md` — the copy there is a starting draft based on
your research, not final text. Rewrite anything that doesn't sound like you.

## Deploy

```bash
git init
git add .
git commit -m "site"
git branch -M main
git remote add origin https://github.com/YOURNAME/YOURNAME.github.io.git
git push -u origin main
```

Then in the repo: **Settings → Pages**

- Source: *Deploy from a branch*
- Branch: `main`, folder `/ (root)`
- Custom domain: `bipinmaharjan7.com.np` — the included `CNAME` file usually fills this in automatically
- Tick **Enforce HTTPS** once the certificate is issued (a few minutes after DNS verifies)

Watch the **Actions** tab for "pages build and deployment". Green check means live.

## Write a post

Add a file to `_posts/` named `YYYY-MM-DD-some-title.md`:

```markdown
---
title: "Your title"
date: 2026-08-01
tags: [koopman, mpc]
summary: "One sentence that shows up in the post list."
---

Your text here.
```

Commit, push, live in about a minute. Everything else — the listing page, the RSS feed,
the sitemap — updates itself.

## Optional: preview locally

Needs Ruby.

```bash
bundle install
bundle exec jekyll serve
```

Then open `http://localhost:4000`.

## Structure

```
_config.yml            site settings and your links
_layouts/              page shells (default, post)
_posts/                blog posts, one markdown file each
assets/css/style.css   all styling, tokens at the top
assets/js/site.js      theme toggle, scroll reveal, research disclosures
assets/js/hero-sim.js  the live hero simulation
index.html             homepage: hero simulation, research, recent posts
writing.html           full post list
about.md               about page
CNAME                  tells GitHub Pages which domain to serve
```

## Design notes

Colours and type live as custom properties at the top of `style.css`. The accent is one
cobalt (`--signal`) used for links, buttons, and the primary plot trace — deliberately
the only saturated colour on the page, so adding a second one will cost you more than
it gains.

Dark mode is a token swap and nothing else. Every colour has its base value on bare
`:root`, and the dark block is repeated twice on purpose: once under
`prefers-color-scheme` for visitors who never touch the toggle, once under
`[data-theme="dark"]` so an explicit choice wins in both directions. Add a colour and
you have to add it in all three places, or it will look right in one theme only.

## The hero simulation

`assets/js/hero-sim.js` runs a real reduced model of an islanded microgrid — droop
primary behind a measurement lag, plus a secondary controller — and plots the frequency
response to a load step. Two controllers race on the identical plant and the identical
actuator: a PI with no anti-windup, and a velocity-form MPC whose QP is solved by
Hildreth's method with the ramp and magnitude limits as explicit constraints.

The point of the ramp-limit slider is that it is what separates them. With plenty of
ramp both controllers look fine. Tighten it and the PI overshoots because it only meets
the limit, while the MPC anticipates it. The nadir is the same for both — that is the
actuator, not the controller, and the plot is honest about it.

Model constants are at the top of the file (`Meq`, `D`, `tau` in `plant()`, the PI gains
and MPC weights just above). The default droop of 12.45 mHz/kW is the measured plant
authority from the Simulink testbed. If you retune, re-check the metrics table — it is
computed from the traces, so it cannot silently disagree with the plot.

Everything is progressive enhancement. Without JavaScript the original hand-drawn SVG
still renders with its CSS draw animation, the sliders and metric table stay hidden, and
the research entries still expand, because they are `<details>` elements.
