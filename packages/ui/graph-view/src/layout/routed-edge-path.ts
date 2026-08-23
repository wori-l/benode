import type { RoutedEdgePoint } from "./graph-layout-types.js";

function distance(left: RoutedEdgePoint, right: RoutedEdgePoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function toward(
  from: RoutedEdgePoint,
  to: RoutedEdgePoint,
  amount: number,
): RoutedEdgePoint {
  const total = distance(from, to);
  if (total === 0) {
    return from;
  }
  const ratio = Math.min(1, amount / total);
  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio,
  };
}

function coordinates(point: RoutedEdgePoint): string {
  return point.x.toString() + " " + point.y.toString();
}

export function routedEdgeCenter(
  route: readonly RoutedEdgePoint[],
): RoutedEdgePoint {
  const total = route.slice(1).reduce(
    (sum, point, index) => sum + distance(route[index] ?? point, point),
    0,
  );
  let remaining = total / 2;
  for (let index = 1; index < route.length; index += 1) {
    const previous = route[index - 1];
    const current = route[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    const segment = distance(previous, current);
    if (remaining <= segment) {
      return toward(previous, current, remaining);
    }
    remaining -= segment;
  }
  return route.at(-1) ?? { x: 0, y: 0 };
}

export function routedEdgePath(
  route: readonly RoutedEdgePoint[],
  borderRadius = 8,
): string {
  const start = route[0];
  if (start === undefined) {
    return "";
  }
  if (route.length === 1) {
    return "M " + coordinates(start);
  }

  let path = "M " + coordinates(start);
  for (let index = 1; index < route.length - 1; index += 1) {
    const previous = route[index - 1];
    const bend = route[index];
    const next = route[index + 1];
    if (previous === undefined || bend === undefined || next === undefined) {
      continue;
    }
    const radius = Math.min(
      borderRadius,
      distance(previous, bend) / 2,
      distance(bend, next) / 2,
    );
    const entry = toward(bend, previous, radius);
    const exit = toward(bend, next, radius);
    path += " L " + coordinates(entry) +
      " Q " + coordinates(bend) + " " + coordinates(exit);
  }

  const end = route.at(-1);
  return end === undefined ? path : path + " L " + coordinates(end);
}
