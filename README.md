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
_config.yml          site settings and your links
_layouts/            page shells (default, post)
_posts/              blog posts, one markdown file each
assets/css/style.css all styling, tokens at the top
index.html           homepage: hero plot, research, recent posts
writing.html         full post list
about.md             about page
CNAME                tells GitHub Pages which domain to serve
```

## Design notes

Colours and type live as custom properties at the top of `style.css`. The accent is one
cobalt (`--signal`) used for links, buttons, and the primary plot trace — deliberately
the only saturated colour on the page, so adding a second one will cost you more than
it gains.

The hero plot is hand-drawn SVG in `index.html`. When you have real simulation data,
swap the two `<path d="...">` values for your actual traces and update the axis labels
— it's the one element on the page that should always show a current result.
