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

Needs Ruby **with** the MSYS2 devkit — several gems in the `github-pages` set
(`commonmarker`, `eventmachine`, `http_parser.rb`) build native extensions.
Ruby 3.3 matches what GitHub Pages itself runs.

```bash
winget install --id RubyInstallerTeam.RubyWithDevKit.3.3 --source winget
bundle install
bundle exec jekyll serve
```

Then open `http://localhost:4000`.

`tzinfo-data` is in the Gemfile because Windows has no zoneinfo database and
the `timezone:` in `_config.yml` cannot resolve without it. It is platform-
gated, so it costs Linux and macOS nothing.

### If gem downloads fail with a certificate error

Avast's Web/Mail Shield terminates TLS and re-signs with its own root, which it
adds to the Windows certificate store. Ruby ships its own CA bundle and ignores
that store, so RubyGems rejects the substituted certificate:

```
SSL verification error at depth 0: unable to get local issuer certificate
```

Either turn off HTTPS scanning in Avast, or hand Ruby a bundle that includes
the root:

```powershell
$cert = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -match "Avast" }
$b64  = [Convert]::ToBase64String($cert.RawData, 'InsertLineBreaks')
$pem  = "-----BEGIN CERTIFICATE-----`n$b64`n-----END CERTIFICATE-----`n"
[IO.File]::WriteAllText("$HOME\.ssl\ca-bundle-avast.pem",
  (Get-Content C:\Ruby33-x64\bin\etc\ssl\cert.pem -Raw) + "`n" + $pem)
$env:SSL_CERT_FILE = "$HOME\.ssl\ca-bundle-avast.pem"
```

The same interception breaks `uv` (`UV_SYSTEM_CERTS=1`), npm
(`NODE_OPTIONS=--use-system-ca`) and winget (`--source winget`, to skip the
`msstore` source it cannot verify). It is antivirus rather than a proxy, so it
follows the machine between networks.

## Structure

```
_config.yml               site settings and your links
_layouts/                 page shells (default, post)
_posts/                   blog posts, one markdown file each
_includes/                generated SVG, inlined at build time
assets/css/style.css      all styling, tokens at the top
assets/css/valley.css     art direction for the About page scene
assets/css/koopman.css    lights the Koopman figure
assets/js/site.js         theme toggle, scroll reveal, research disclosures
assets/js/hero-sim.js     the live hero simulation
blender/koopman_lift.py   generates the Koopman figure (excluded from the build)
blender/koopman_lift.blend  its authoring document — camera and framing
index.html                homepage: hero simulation, research, recent posts
writing.html              full post list
about.html                about page
CNAME                     tells GitHub Pages which domain to serve
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

## The Koopman figure

The drawing inside the thesis panel is modelled in Blender and shipped as inline
SVG. No 3D reaches the browser and there is no runtime dependency:
`blender/koopman_lift.py` integrates the swing equation, builds the scene, and
projects it through Blender's own camera to emit paths.

```bash
blender --background --factory-startup --python blender/koopman_lift.py
```

That rewrites `_includes/koopman-lift.svg` and re-saves the `.blend`. To change
the framing, open `blender/koopman_lift.blend`, move the camera, and re-run with
`-- --from-blend` to reuse it. Annotation placement is derived from the
projection — which corner carries the ground axes, and where the vertical ruler
goes — so the labels follow the camera rather than needing to be nudged.

Do not hand-edit the SVG; the next run overwrites it. Plant constants (`D`,
`P_SET`, the initial angle) are at the top of the script, and the sheet is the
graph of the observable itself, so retuning them moves both levels together.

The SVG carries no colour. Every stroke is `stroke="currentColor"` plus a class,
lit from `koopman.css` out of the same tokens as everything else — the same
arrangement as the valley scene, and the reason the figure follows the theme
with no second palette to maintain. `--signal` and `--ink-faint` keep the
meaning they have in the hero legend: the Koopman result against its baseline.

The trajectories draw on when the disclosure opens rather than on load, because
the panel starts closed. Only the lifted path animates its dash array — the
state-space path is dashed at rest, and animating `stroke-dasharray` would end
it solid, since `both` holds the animation's last frame and not the declared
style.
