---
title: "What a grid-forming inverter is actually doing"
date: 2026-07-23
tags: [inverters, microgrids, droop]
summary: "The distinction between grid-following and grid-forming is not about hardware. It's about which quantity you treat as given."
---

Ask what separates a grid-following inverter from a grid-forming one and you'll often
get an answer about control loops or firmware. The hardware is frequently identical.
The difference is a modelling assumption, and it decides everything downstream.

A grid-following inverter treats voltage and frequency as given. It locks onto them
with a phase-locked loop and injects the current it was asked to inject. It is a
current source that happens to be polite about phase. Remove the grid and it has
nothing to lock onto — the PLL has no reference, and the inverter shuts down.

A grid-forming inverter treats voltage and frequency as things it produces. It behaves
like a voltage source behind an impedance, and it decides its own angle. That's the
whole shift: from "what does the grid want from me" to "what should the grid look
like."

## Where droop comes from

Once an inverter forms its own voltage, two of them on the same bus have a problem.
Nothing keeps their angles aligned, and even a small angle difference between two stiff
voltage sources pushes enormous circulating current between them.

Droop control solves this by making each unit's frequency depend on the real power it's
delivering, and its voltage on the reactive power. Take on more load, run slightly
slower. Because every unit on the microgrid ultimately settles at one common frequency,
this quietly forces them to share load in proportion to their droop coefficients — with
no communication link at all.

It's a beautiful mechanism, and it costs you something: the settled frequency is not
the nominal frequency. Droop is a proportional controller, so it leaves steady-state
error by construction.

## Which is where secondary control comes in

Something has to push frequency back to nominal after droop has done the sharing. In a
conventional system that's a slow integral controller sitting above the droop loop.

That layer is where my thesis lives. The plant it acts on is nonlinear — power flow
involves sines of angle differences, and the LCL filter and dynamic loads add their own
dynamics — so the conventional answer is a PI controller tuned around one operating
point and hoped to be adequate at the others.

The alternative I'm testing is to learn a linear predictor for the lifted dynamics and
put constrained MPC on top of it. Same job, better excursions, and honest constraint
handling instead of anti-windup patches.

More on how that turns out as the results come in.
