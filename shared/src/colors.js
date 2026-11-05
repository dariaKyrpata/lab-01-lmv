export const SHIP_COLORS = Object.freeze([
  Object.freeze({
    id: "pink",
    name: "Рожевий",
    color: "#ff69b4",
    filter: "none",
  }),
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

export function getShipColor(colorId) {
  return SHIP_COLORS.find(
    (item) => item.id === colorId
  ) ?? null;
}

export function getAvailableColors(takenColorIds = []) {
  const taken = new Set(takenColorIds);

  return SHIP_COLORS.filter(
    (item) => !taken.has(item.id)
  );
}