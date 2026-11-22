// The human body, built as a real human shape — not a cylinder.
// One module, one job: the geometry every person in the city shares
// (pedestrians in traffic.js, Jules in player.js), so both read as the
// same kind of figure. Proportions for a ~1.80 m figure: head 0.24 tall
// (1/7 of height), legs 0.88 (half the height), shoulders 0.48 wide,
// waist 0.34, hips 0.40.

import * as THREE from 'three';

// The torso as a front silhouette — shoulders wide, waist narrow, hips
// wide again — extruded with a bevel so its edges are rounded. yBottom
// is where the piece starts (0.78 for a whole torso, 1.00 for a jacket
// that leaves the shirt showing below it); grow widens it a little
// (a jacket sits proud of the shirt). The shape is drawn in the XY
// plane (front view) and extruded along Z, centred on the body.
export function torsoGeometry(yBottom, grow) {
  // Front silhouette landmarks, bottom to top: [height, half-width].
  const marks = [
    [0.78, 0.165 + grow],
    [0.95, 0.150 + grow],
    [1.08, 0.135 + grow],
    [1.18, 0.150 + grow],
    [1.28, 0.175 + grow],
    [1.38, 0.195 + grow],
    [1.46, 0.200 + grow],
  ];
  function widthAt(y) {
    for (let i = 0; i < marks.length - 1; i += 1) {
      if (y >= marks[i][0] && y <= marks[i + 1][0]) {
        const t = (y - marks[i][0]) / (marks[i + 1][0] - marks[i][0]);
        return marks[i][1] + (marks[i + 1][1] - marks[i][1]) * t;
      }
    }
    return marks[marks.length - 1][1];
  }
  const w0 = widthAt(yBottom);
  const left = [[-w0, yBottom]];
  for (const [y, w] of marks) if (y > yBottom) left.push([-w, y]);
  const right = [];
  for (let i = marks.length - 1; i >= 0; i -= 1) {
    if (marks[i][0] > yBottom) right.push([marks[i][1], marks[i][0]]);
  }
  right.push([w0, yBottom]);
  const s = new THREE.Shape();
  s.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < left.length - 1; i += 1) {
    const mx = (left[i][0] + left[i + 1][0]) / 2;
    const my = (left[i][1] + left[i + 1][1]) / 2;
    s.quadraticCurveTo(left[i][0], left[i][1], mx, my);
  }
  s.lineTo(left[left.length - 1][0], left[left.length - 1][1]);
  s.lineTo(right[0][0], right[0][1]);
  for (let i = 1; i < right.length - 1; i += 1) {
    const mx = (right[i][0] + right[i + 1][0]) / 2;
    const my = (right[i][1] + right[i + 1][1]) / 2;
    s.quadraticCurveTo(right[i][0], right[i][1], mx, my);
  }
  s.lineTo(right[right.length - 1][0], right[right.length - 1][1]);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.16, bevelEnabled: true, bevelThickness: 0.04,
    bevelSize: 0.035, bevelSegments: 2, steps: 1,
  });
  geo.translate(0, 0, -0.08);
  return geo;
}

// A limb segment that tapers from its top (at the joint) to its bottom,
// translated so it hangs down from a pivot at y=0. A box, not a tube:
// flat faces, a shaped silhouette, a visible joint where two meet.
export function taperedLimb(wTop, wBottom, h, dTop, dBottom) {
  const geo = new THREE.BoxGeometry(wBottom, h, dBottom);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    if (pos.getY(i) > 0) {
      pos.setX(i, pos.getX(i) * (wTop / wBottom));
      pos.setZ(i, pos.getZ(i) * (dTop / dBottom));
    }
  }
  geo.translate(0, -h / 2, 0);
  geo.computeVertexNormals();
  return geo;
}
