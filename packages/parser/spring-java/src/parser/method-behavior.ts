export const LOW_SIGNAL_METHOD_BEHAVIORS = [
  "trivialConstructor",
  "trivialBuilder",
  "trivialGetter",
  "trivialSetter",
  "trivialFluentSetter",
] as const;

export type LowSignalMethodBehavior =
  (typeof LOW_SIGNAL_METHOD_BEHAVIORS)[number];

export function isLowSignalMethodBehavior(
  value: unknown,
): value is LowSignalMethodBehavior {
  return LOW_SIGNAL_METHOD_BEHAVIORS.some(
    (behavior) => behavior === value,
  );
}
