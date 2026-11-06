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

function botColor<Id extends string>(id: Id, name: string, color: string) {
  return Object.freeze({ id, name, color, filter: "none" });
}

export const BOT_SHIP_COLORS = Object.freeze([
  botColor("bot-red", "Червоний", "#ff414d"),
  botColor("bot-yellow", "Жовтий", "#ffed4a"),
  botColor("bot-cyan", "Бірюзовий", "#23e6ec"),
  botColor("bot-violet", "Фіолетовий", "#b47dff"),
  botColor("bot-lime", "Салатовий", "#b9ff42"),
  botColor("bot-white", "Білий", "#f5f6ff"),
  botColor("bot-indigo", "Індиго", "#5355ed"),
  botColor("bot-copper", "Мідний", "#c26b46"),
]);

const ALL_SHIP_COLORS = [...SHIP_COLORS, ...BOT_SHIP_COLORS];

export type PlayerColorId = (typeof SHIP_COLORS)[number]["id"];
export type ColorId = (typeof ALL_SHIP_COLORS)[number]["id"];

export function getShipColor(colorId: unknown) {
  return ALL_SHIP_COLORS.find(item => item.id === colorId) ?? null;
}

export function getAvailableColors(takenColorIds: Iterable<ColorId> = []) {
  const taken = new Set(takenColorIds);

  return SHIP_COLORS.filter(
    (item) => !taken.has(item.id)
  );
}