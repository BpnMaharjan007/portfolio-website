---
layout: default
title: About
permalink: /about/
---

<section class="wrap prose-page">
  <p class="eyebrow">About</p>
  <h1 class="prose-title">Hello</h1>
  <div class="prose" markdown="1">

I'm a graduate researcher in electrical engineering. My work sits at the point where
power electronics stops being a circuit problem and starts being a control problem:
inverters that have to hold up a grid on their own, with no stiff source behind them
to hide the mistakes.

The thesis question is narrow on purpose. Droop-controlled grid-forming inverters are
nonlinear, and the usual response is either to linearise around an operating point and
accept the error, or to reach for a black-box learned controller and give up on
guarantees. Koopman operator theory offers a third route: lift the state into a space
of observables where the dynamics are close to linear, identify that linear model from
data with EDMDc, and then use every well-understood tool from linear MPC on top of it.

Whether that route actually pays off is an empirical question, which is why the same
islanded microgrid testbed also carries a multi-agent reinforcement learning
controller. Two paradigms, one plant, one set of load steps.

## Interests

- Koopman operator theory, EDMDc, and data-driven linear predictors
- Model predictive control for power electronics and inverter-dominated grids
- Grid-forming and grid-following control hierarchies, droop and secondary control
- Deep and multi-agent reinforcement learning applied to power systems
- Physics-informed neural networks as surrogate models inside control loops

## Tools

MATLAB and Simulink for the plant models and hardware-facing work. Python for the
learning side — PyTorch, Gymnasium, pandapower — plus whatever small parsers and
harnesses the pipeline needs along the way.

  </div>
</section>
