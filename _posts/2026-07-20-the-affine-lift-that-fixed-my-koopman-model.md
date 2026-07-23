---
title: "The affine lift that fixed my Koopman model"
date: 2026-07-20
tags: [koopman, edmdc, mpc]
summary: "A single constant observable took multi-step prediction error from 16.8% to 2.25%. Here's why that isn't a trick."
---

For weeks my EDMDc model was accurate enough to look promising and wrong enough to be
useless. One-step prediction was fine. Roll it forward thirty steps — the horizon the
MPC actually needs — and the multi-step NRMSE sat around 16.8%. The trajectory shape
was right. The level was not.

The fix was one observable: a constant. Setting the first entry of the lifted state to
1 for every sample.

## Why a constant matters

EDMDc fits a linear map from lifted state and input to next lifted state. Every term in
that map is proportional to something in the data. If the true dynamics have any offset
that doesn't scale with the state — an equilibrium that isn't at the origin, a bias in
the measurement, a load contribution the input doesn't see — a purely linear map has no
way to express it. It can only approximate the offset by bending the state-dependent
terms, and those bends compound every time you roll the prediction forward.

Including a constant observable gives the regression an affine term. The identified
model becomes

    z(k+1) = A z(k) + B u(k) + c

with `c` absorbed into `A` through the constant entry. Now the offset is represented
once, explicitly, instead of being smeared across the state matrix.

Multi-step NRMSE dropped to 2.25%.

## The part that's easy to miss

Rescaling the inputs and outputs to comparable magnitudes mattered almost as much. Real
power setpoints live in the hundreds of watts; frequency deviations live in hundredths
of a hertz. Handed to a least-squares solve unscaled, the DC gain of the identified
model is conditioned badly enough that the controller's steady-state behaviour is
essentially arbitrary — not unstable, just quietly wrong.

Neither of these is a contribution. Both are the difference between a pipeline that
produces a result and one that produces a plot you have to apologise for.

## What I'd check first next time

- Does the lifted dictionary include a constant?
- Are inputs and outputs on comparable scales before the regression?
- Is multi-step error being reported at the MPC horizon, not at one step?

The third one is the trap. One-step error flatters every model ever fitted.
