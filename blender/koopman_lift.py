"""Generate the Koopman lift figure for the research section.

Builds the scene in Blender, then projects it through Blender's own camera to
emit line-art SVG. Blender is the authoring environment -- the .blend it saves
is the source of truth for framing -- but nothing 3D ships to the browser: the
output is a few hundred <path> elements carrying no colour of their own.

    WHAT THE FIGURE ARGUES

    Droop-controlled grid-forming inverters swing according to

        d(delta)/dt = omega
        M d(omega)/dt = P_set - P_max sin(delta) - D omega

    which is nonlinear only through sin(delta). On the base plane that shows up
    as a curved spiral into equilibrium. Lift the state with the sine embedding
    of the power angle and the trajectory rises onto the graph of that
    observable -- the corrugated sheet -- which is where a linear predictor has
    something straight to hold on to. The sheet is not decoration: it is the
    observable itself, the same sine/cosine pair the thesis adds grid-tied and
    drops when islanded.

    COLOUR

    None is baked in. Every stroke carries stroke="currentColor" as a fallback
    so a page that fails to load CSS still shows a legible drawing, and a class
    so koopman.css can light it from the site tokens. This mirrors how the
    valley scene is built.

Usage:
    blender --background --factory-startup --python blender/koopman_lift.py
    blender --background --factory-startup --python blender/koopman_lift.py -- --from-blend

The second form loads the saved .blend and reuses whatever camera you left in
it, so framing can be adjusted in Blender and re-exported without touching this
file.
"""

import math
import os
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

# --- plant ------------------------------------------------------------------
M = 1.0  # inertia
D = 0.28  # damping
P_MAX = 1.0
P_SET = 0.35

DELTA_0 = 2.35  # rad, released well away from equilibrium
OMEGA_0 = 0.0
DT = 0.004
T_END = 58.0

DELTA_EQ = math.asin(P_SET / P_MAX)

# --- world layout -----------------------------------------------------------
DELTA_LO, DELTA_HI = -0.45, 2.70
OMEGA_LO, OMEGA_HI = -1.15, 1.15
SX = 1.30  # world units per rad of delta
SY = 1.30  # world units per unit omega
LIFT_Z = 1.75  # sheet floats this far above the base plane
LIFT_A = 0.72  # sheet amplitude

SHEET_ROWS = 7  # constant-omega curves drawn across the sheet
SHEET_COLS = 96  # samples along each
GRID_LINES = 6
TIE_COUNT = 9
TRAJ_SAMPLES = 340

# --- output -----------------------------------------------------------------
W, H = 1200.0, 780.0
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SVG_OUT = os.path.join(REPO, "_includes", "koopman-lift.svg")
BLEND_OUT = os.path.join(HERE, "koopman_lift.blend")


def x_of(delta):
    return (delta - 0.5 * (DELTA_LO + DELTA_HI)) * SX


def y_of(omega):
    return omega * SY


def sheet_z(delta):
    """The observable, as height. This is the graph of sin(delta)."""
    return LIFT_Z + LIFT_A * math.sin(delta)


def simulate():
    """RK4 on the swing equation. Returns [(delta, omega), ...]."""

    def deriv(state):
        delta, omega = state
        return (
            omega,
            (P_SET - P_MAX * math.sin(delta) - D * omega) / M,
        )

    def step(state, dt):
        k1 = deriv(state)
        s2 = (state[0] + 0.5 * dt * k1[0], state[1] + 0.5 * dt * k1[1])
        k2 = deriv(s2)
        s3 = (state[0] + 0.5 * dt * k2[0], state[1] + 0.5 * dt * k2[1])
        k3 = deriv(s3)
        s4 = (state[0] + dt * k3[0], state[1] + dt * k3[1])
        k4 = deriv(s4)
        return (
            state[0] + dt / 6.0 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
            state[1] + dt / 6.0 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
        )

    state = (DELTA_0, OMEGA_0)
    out = [state]
    steps = int(T_END / DT)
    for _ in range(steps):
        state = step(state, DT)
        out.append(state)

    # Even subsample: enough points for a smooth path, few enough to keep the
    # SVG small.
    stride = max(1, len(out) // TRAJ_SAMPLES)
    return out[::stride]


def geometry(traj, project):
    """All drawable geometry in world space.

    Takes the projector because annotation placement is a screen-space
    question: which corner is nearest the viewer, and which is leftmost,
    depends on where the camera ended up. Deriving that here means the
    labels stay put if the camera is moved in Blender and re-exported.

    Returns (lines, labels) where lines is a list of
    (css_class, [Vector, ...], closed) and labels is a list of
    (css_class, text, Vector, anchor).
    """
    lines = []
    labels = []

    x_lo, x_hi = x_of(DELTA_LO), x_of(DELTA_HI)
    y_lo, y_hi = y_of(OMEGA_LO), y_of(OMEGA_HI)

    # --- base plane graticule
    for i in range(GRID_LINES + 1):
        t = i / GRID_LINES
        x = x_lo + t * (x_hi - x_lo)
        lines.append(("k-grid", [Vector((x, y_lo, 0)), Vector((x, y_hi, 0))], False))
        y = y_lo + t * (y_hi - y_lo)
        lines.append(("k-grid", [Vector((x_lo, y, 0)), Vector((x_hi, y, 0))], False))

    lines.append((
        "k-plane",
        [
            Vector((x_lo, y_lo, 0)),
            Vector((x_hi, y_lo, 0)),
            Vector((x_hi, y_hi, 0)),
            Vector((x_lo, y_hi, 0)),
        ],
        True,
    ))

    # --- the sheet: the graph of the observable, drawn as constant-omega curves
    for r in range(SHEET_ROWS):
        t = r / (SHEET_ROWS - 1)
        omega = OMEGA_LO + t * (OMEGA_HI - OMEGA_LO)
        pts = []
        for c in range(SHEET_COLS + 1):
            u = c / SHEET_COLS
            delta = DELTA_LO + u * (DELTA_HI - DELTA_LO)
            pts.append(Vector((x_of(delta), y_of(omega), sheet_z(delta))))
        # The two outer curves are the sheet's silhouette and read heavier.
        cls = "k-sheet-edge" if r in (0, SHEET_ROWS - 1) else "k-sheet"
        lines.append((cls, pts, False))

    # Close the sheet across its short ends so it reads as a surface, not a
    # loose stack of curves.
    for delta in (DELTA_LO, DELTA_HI):
        lines.append((
            "k-sheet-edge",
            [
                Vector((x_of(delta), y_lo, sheet_z(delta))),
                Vector((x_of(delta), y_hi, sheet_z(delta))),
            ],
            False,
        ))

    # --- trajectories
    base_pts = [Vector((x_of(d), y_of(w), 0.0)) for d, w in traj]
    lift_pts = [Vector((x_of(d), y_of(w), sheet_z(d))) for d, w in traj]
    lines.append(("k-flow-base", base_pts, False))
    lines.append(("k-flow-lift", lift_pts, False))

    # --- tie lines, showing the lift is pointwise.
    #
    # Spaced by arc length along the spiral, not by sample index. The
    # trajectory spends most of its *time* sitting at equilibrium, so evenly
    # spaced indices pile every tie onto the same point at the centre.
    seg = [0.0]
    for a, b in zip(base_pts, base_pts[1:]):
        seg.append(seg[-1] + (b - a).length)
    total = seg[-1]
    for k in range(TIE_COUNT):
        want = (k + 0.5) / TIE_COUNT * total
        i = min(range(len(seg)), key=lambda j: abs(seg[j] - want))
        lines.append(("k-tie", [base_pts[i], lift_pts[i]], False))

    # --- equilibrium, on both levels
    eq_base = Vector((x_of(DELTA_EQ), 0.0, 0.0))
    eq_lift = Vector((x_of(DELTA_EQ), 0.0, sheet_z(DELTA_EQ)))
    lines.append(("k-tie k-tie-eq", [eq_base, eq_lift], False))

    # --- axes
    #
    # Placement is read off the projection rather than assumed, so the
    # annotation survives the camera being moved in Blender and re-exported.
    #
    # The two ground axes hang off the corner nearest the viewer, where
    # nothing overlaps them. The vertical axis goes at the *leftmost* corner
    # instead: a vertical world line projects to a vertical screen line, and
    # at the near corner that line runs straight up through the sheet's
    # silhouette. At the left extreme it clears the drawing entirely.
    corners = [
        Vector((x_lo, y_lo, 0.0)),
        Vector((x_hi, y_lo, 0.0)),
        Vector((x_hi, y_hi, 0.0)),
        Vector((x_lo, y_hi, 0.0)),
    ]
    screen = [project(c) for c in corners]
    near = corners[max(range(4), key=lambda i: screen[i][1])]
    left = corners[min(range(4), key=lambda i: screen[i][0])]

    cx, cy = 0.5 * (x_lo + x_hi), 0.5 * (y_lo + y_hi)
    off = 0.45
    axis_y = near.y + math.copysign(off, near.y - cy)
    axis_x = near.x + math.copysign(off, near.x - cx)

    lines.append(("k-axis", [Vector((x_lo, axis_y, 0)), Vector((x_hi, axis_y, 0))], False))
    lines.append(("k-axis", [Vector((axis_x, y_lo, 0)), Vector((axis_x, y_hi, 0))], False))

    labels.append(("k-label", "δ", Vector((x_hi + 0.28, axis_y, 0)), "start"))
    labels.append(("k-label", "ω", Vector((axis_x + 0.10, y_hi + 0.30, 0)), "start"))

    # The lift ruler, doubling as the legend for the two levels: a tick at
    # the ground and a tick at the sheet, each captioned.
    # Kept close to the plane's left corner: the captions hanging off it are
    # what set the figure's left margin, so pushing the ruler further out
    # only widens the viewBox and shrinks the drawing inside it.
    vx = left.x + math.copysign(0.32, left.x - cx)
    vy = left.y + math.copysign(0.32, left.y - cy)
    v_delta = vx / SX + 0.5 * (DELTA_LO + DELTA_HI)
    z_sheet = sheet_z(v_delta)
    z_top = LIFT_Z + LIFT_A + 0.42

    lines.append(("k-axis", [Vector((vx, vy, 0.0)), Vector((vx, vy, z_top))], False))

    tick = 0.20
    tx = vx + math.copysign(tick, left.x - cx)
    ty = vy + math.copysign(tick, left.y - cy)
    for z in (0.0, z_sheet):
        lines.append(("k-axis", [Vector((vx, vy, z)), Vector((tx, ty, z))], False))

    labels.append(("k-label", "sin δ", Vector((vx, vy, z_top + 0.34)), "middle"))
    labels.append(("k-note", "STATE SPACE", Vector((tx, ty, 0.0)), "end"))
    labels.append(("k-note", "OBSERVABLE", Vector((tx, ty, z_sheet)), "end"))

    return lines, labels, (base_pts, lift_pts, eq_base, eq_lift)


def build_camera():
    """The camera has to exist before the geometry, because annotation
    placement is decided in screen space."""
    scene = bpy.context.scene
    scene.render.resolution_x = int(W)
    scene.render.resolution_y = int(H)
    scene.render.resolution_percentage = 100

    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    cam_data = bpy.data.cameras.new("FigureCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 7.6
    cam = bpy.data.objects.new("FigureCam", cam_data)
    scene.collection.objects.link(cam)

    # A three-quarter technical view: high enough to separate the two levels,
    # turned enough that the sheet reads as a surface rather than an edge.
    cam.rotation_euler = (math.radians(66.0), 0.0, math.radians(40.0))
    direction = Vector((0.0, 0.0, 1.0))
    direction.rotate(cam.rotation_euler)
    cam.location = Vector((0.0, 0.0, 0.62 * (LIFT_Z + LIFT_A))) + direction * 14.0
    scene.camera = cam

    bpy.context.view_layer.update()
    return scene, cam


def add_curves(scene, lines):
    """Mirror the geometry into real curve objects, so the saved .blend is an
    editable document rather than an empty file with a camera in it."""
    coll = scene.collection
    for idx, (cls, pts, closed) in enumerate(lines):
        curve = bpy.data.curves.new(f"k_{idx:03d}", type="CURVE")
        curve.dimensions = "3D"
        spline = curve.splines.new("POLY")
        spline.points.add(len(pts) - 1)
        for i, p in enumerate(pts):
            spline.points[i].co = (p.x, p.y, p.z, 1.0)
        spline.use_cyclic_u = closed
        obj = bpy.data.objects.new(f"{cls.split()[0]}_{idx:03d}", curve)
        coll.objects.link(obj)


def make_projector(scene, cam):
    def project(p):
        ndc = world_to_camera_view(scene, cam, p)
        return (ndc.x * W, (1.0 - ndc.y) * H)

    return project


def path_d(pts, project, closed):
    out = []
    for i, p in enumerate(pts):
        x, y = project(p)
        out.append(f"{'M' if i == 0 else 'L'}{x:.1f} {y:.1f}")
    if closed:
        out.append("Z")
    return "".join(out)


def content_box(lines, labels, project):
    """Tight bounds of everything drawn, so the viewBox has no dead margin.

    Text is estimated rather than measured -- there is no font metric
    available here -- using the monospace advance the stylesheet will use.
    """
    xs, ys = [], []
    for _, pts, _ in lines:
        for p in pts:
            x, y = project(p)
            xs.append(x)
            ys.append(y)

    for cls, text, pos, anchor in labels:
        x, y = project(pos)
        size = 14.0 if cls == "k-note" else 23.0
        width = len(text) * size * 0.62
        left = {"start": 0.0, "middle": -width / 2.0, "end": -width}[anchor]
        xs.extend((x + left, x + left + width))
        ys.extend((y - size * 0.82, y + size * 0.28))  # baseline to box

    pad = 14.0
    return min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad


def emit_svg(lines, labels, extras, project):
    base_pts, lift_pts, eq_base, eq_lift = extras
    parts = []
    add = parts.append

    x0, y0, x1, y1 = content_box(lines, labels, project)
    add(
        '<svg class="koopman" viewBox="{:.1f} {:.1f} {:.1f} {:.1f}" '
        'xmlns="http://www.w3.org/2000/svg" role="img" '
        'aria-labelledby="koopman-lift-title koopman-lift-desc">'.format(
            x0, y0, x1 - x0, y1 - y0
        )
    )
    add(
        '<title id="koopman-lift-title">The sine lift of a droop-controlled '
        "inverter's power angle</title>"
    )
    add(
        '<desc id="koopman-lift-desc">A three-quarter technical drawing in two '
        "levels. On the lower plane, spanned by power angle and frequency "
        "deviation, the inverter's trajectory spirals inward to equilibrium "
        "along a visibly curved path. Floating above it is a corrugated sheet, "
        "the graph of sine of the power angle. Vertical ties connect points on "
        "the lower trajectory to the matching points on the sheet, where the "
        "lifted trajectory runs along the corrugation. The curvature that makes "
        "the lower path nonlinear is carried by the shape of the sheet.</desc>"
    )

    # Grouped by class so the CSS has few, broad selectors to hit, and so the
    # draw order is explicit: ground first, sheet last.
    order = [
        "k-grid",
        "k-plane",
        "k-flow-base",
        "k-tie",
        "k-tie k-tie-eq",
        "k-sheet",
        "k-sheet-edge",
        "k-flow-lift",
        "k-axis",
    ]
    by_class = {}
    for cls, pts, closed in lines:
        by_class.setdefault(cls, []).append((pts, closed))

    for cls in order:
        items = by_class.get(cls)
        if not items:
            continue
        add(f'<g class="{cls}" fill="none" stroke="currentColor">')
        # pathLength normalises the trajectories so the draw-on animation in
        # koopman.css can use exact 0..1 dash values instead of guessing a
        # length that changes whenever the plant constants are retuned.
        extra = ' pathLength="1"' if cls.startswith("k-flow") else ""
        for pts, closed in items:
            add(f'<path{extra} d="{path_d(pts, project, closed)}"/>')
        add("</g>")

    # Start state and equilibrium: an open ring for "released here", a filled
    # dot for "settles here", on both levels.
    add('<g class="k-mark" stroke="currentColor">')
    for p in (base_pts[0], lift_pts[0]):
        x, y = project(p)
        add(f'<circle class="k-mark-start" cx="{x:.1f}" cy="{y:.1f}" r="4.5" fill="none"/>')
    for p in (eq_base, eq_lift):
        x, y = project(p)
        add(f'<circle class="k-mark-eq" cx="{x:.1f}" cy="{y:.1f}" r="3.6" fill="currentColor"/>')
    add("</g>")

    add('<g class="k-text" fill="currentColor" stroke="none">')
    for cls, text, pos, anchor in labels:
        x, y = project(pos)
        add(
            f'<text class="{cls}" x="{x:.1f}" y="{y:.1f}" '
            f'text-anchor="{anchor}">{text}</text>'
        )
    add("</g>")

    add("</svg>")
    return "\n".join(parts) + "\n"


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    from_blend = "--from-blend" in argv

    traj = simulate()

    if from_blend and os.path.exists(BLEND_OUT):
        # Reuse whatever camera was left in the .blend, so framing can be
        # adjusted in Blender and re-exported without editing this file.
        bpy.ops.wm.open_mainfile(filepath=BLEND_OUT)
        scene = bpy.context.scene
        cam = scene.camera
        if cam is None:
            raise SystemExit("saved .blend has no active camera")
        project = make_projector(scene, cam)
        lines, labels, extras = geometry(traj, project)
    else:
        scene, cam = build_camera()
        project = make_projector(scene, cam)
        lines, labels, extras = geometry(traj, project)
        add_curves(scene, lines)
        os.makedirs(os.path.dirname(BLEND_OUT), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)

    svg = emit_svg(lines, labels, extras, project)

    os.makedirs(os.path.dirname(SVG_OUT), exist_ok=True)
    with open(SVG_OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(svg)

    print(f"KOOPMAN_SVG_OK paths={svg.count('<path')} bytes={len(svg)} -> {SVG_OUT}")
    print(f"KOOPMAN_BLEND {BLEND_OUT}")
    print(f"KOOPMAN_EQ delta_eq={DELTA_EQ:.4f} rad, traj_points={len(traj)}")


main()
