export const DEFAULT_SHIP_COLOR = Object.freeze({
  id: "pink",
  name: "Рожевий",
  color: "#ff69b4",
  filter: "none",
});

export const SHIP_COLORS = Object.freeze([
  DEFAULT_SHIP_COLOR,
  Object.freeze({
    id: "blue",
    name: "Синій",
    color: "#65a7ff",
    filter: "hue-rotate(240deg)",
  }),
  Object.freeze({
    id: "green",
    name: "Зелений",
    color: "#6de69e",
    filter: "hue-rotate(150deg)",
  }),
  Object.freeze({
    id: "orange",
    name: "Помаранчевий",
    color: "#ffad57",
    filter: "hue-rotate(60deg)",
  }),
]);

export type ColorId = (typeof SHIP_COLORS)[number]["id"];

export function getShipColor(colorId: unknown) {
  return SHIP_COLORS.find(
    (item) => item.id === colorId
  ) ?? null;
}

export function getAvailableColors(takenColorIds: Iterable<ColorId> = []) {
  const taken = new Set(takenColorIds);

  return SHIP_COLORS.filter(
    (item) => !taken.has(item.id)
  );
}