---
version: 1
slug: "design-landing-html"
primary_target: "design/landing.html"
related_targets: []
---

# Landing page (Persuade)

Scope: the public landing page at `/`. Visitor mode: Persuade. Audience: open-source maintainers deciding to install the Argus GitHub App, and hackathon judges watching the demo. Action: install the App (add the `argus` label to start). Proof: a real investigation replayed, live verified count from the event log. Constraints: dark-first, flat UI chrome, mono for evidence, role and status colors as pinned in PRODUCT.md.

Direction source: user-pinned (2026-11-06). The user rejected two rolled hands and pinned the Echo site (github.com/Gravyie/echo, web/) as the reference for structure and motion, themed on the Argus myth through public-domain paintings. The pin beats the roll.

## Direction contract

THESIS: The watchman who never closes every eye. Old-master paintings of the Argus myth carry the page's mood; the product proves itself in a live investigation window. Refuses the dev-tool default of a glowing gradient and a centered screenshot.

OWN-WORLD: Near-black olive ground (#0d0d0b family) taken from the paintings' shadows; bone text; one brand gold (#d9b673) from the peacock-eye rings, used only for the brand (italic line, eyebrow marker, logo iris). Role inks: Triager blue, Reproducer orange, Skeptic magenta, Scribe purple. Status: green ✔, red ✘, amber pending. Spectral serif display with italic, Geist sans body, Geist Mono for evidence and eyebrows. Full-bleed painting bands with credits in mono.

STORY: A maintainer sees that a PR's claim can be proven or broken without reading the code, watches the four agents do it, trusts the verdict, and installs the App.

FIRST VIEWPORT: Velázquez, Mercury and Argus, full-bleed, darkened on the left. Bottom-left: mono eyebrow, a two-line serif headline ("Don't close the door." / italic gold "Make them prove it."), one sentence, Install button + "Watch a run" link. Credit top-right in mono. The investigation window overlaps the hero's lower edge.

FORM: Echo-pattern editorial landing (user reference), myth paintings as bands; not from the roll's list. seed: 06bd7b82c52b6862 (overridden by the user's pin).

SIGNATURE: The investigation window plays one PR as a loop: claim → fails on main / passes on PR → the Skeptic's probe breaks it → verdict stamp and the label flip. Motion grammar: fade-up reveals (22px, 0.7s, ease-out-expo), pinned scroll tour with step rail, auto-advancing steps with a progress hairline; all off under reduced motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
